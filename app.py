import os
import logging
import random
from flask import Flask, jsonify, request, render_template, send_from_directory, g
from collections import defaultdict
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
base_dir = os.path.dirname(os.path.abspath(__file__))
static_folder = os.path.join(base_dir, 'static')
templates_folder = os.path.join(base_dir, 'templates')

app = Flask(__name__, 
            static_folder=static_folder,
            template_folder=templates_folder)

# Database Configuration
def get_db():
    """Get database connection with proper error handling"""
    if 'db' not in g:
        try:
            g.db = mysql.connector.connect(
                host=os.getenv('DB_HOST', 'localhost'),
                port=int(os.getenv('DB_PORT', 3306)),
                user=os.getenv('DB_USER', 'root'),
                password=os.getenv('DB_PASSWORD', 'root'),
                database=os.getenv('DB_NAME', 'timetable_generator'),
                autocommit=False,
                charset='utf8mb4',
                collation='utf8mb4_unicode_ci'
            )
        except Error as e:
            logger.error(f"Database connection failed: {e}")
            raise e
    return g.db
@app.teardown_appcontext
def close_db(error):
    """Close database connection"""
    db = g.pop('db', None)
    if db is not None and db.is_connected():
        db.close()

def execute_query(query, params=None, fetch=False):
    """Execute database queries with proper error handling"""
    db = get_db()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(query, params or ())
        if fetch:
            result = cursor.fetchall()
        else:
            db.commit()
            result = cursor.lastrowid if cursor.lastrowid else True
        return result
    except Error as e:
        db.rollback()
        logger.error(f"Query execution failed: {e}")
        raise e
    finally:
        cursor.close()

def validate_required_fields(data, required_fields):
    """Validate required fields in request data"""
    missing_fields = [field for field in required_fields if not data.get(field)]
    if missing_fields:
        return f"Missing required fields: {', '.join(missing_fields)}"
    return None

class TimetableGenerator:
    def __init__(self, classes, subjects, constraints, teachers):
        self.classes = classes
        self.subjects = subjects
        self.constraints = constraints
        self.teachers = teachers
        self.days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][:constraints.get('working_days', 5)]
        self.periods_per_day = constraints.get('periods_per_day', 6)
        self.break_periods = self.parse_break_periods(constraints.get('break_periods', ''))
        
        # Initialize data structures
        self.class_timetables = {}
        self.teacher_schedules = defaultdict(lambda: defaultdict(lambda: defaultdict(str)))
        self.teacher_weekly_hours = defaultdict(int)
        self.subject_weekly_count = defaultdict(lambda: defaultdict(int))
        
        # Track teacher daily workload and consecutive periods
        self.teacher_daily_periods = defaultdict(lambda: defaultdict(int))
        self.teacher_consecutive_count = defaultdict(lambda: defaultdict(int))
        
    def parse_break_periods(self, break_periods_str):
        if not break_periods_str:
            return []
        try:
            return [int(p.strip()) for p in break_periods_str.split(',') if p.strip()]
        except:
            return []
    
    def check_teacher_free_periods(self, teacher_code, day):
        """Check if teacher has minimum required free periods for the day"""
        teacher = next((t for t in self.teachers if t['code'] == teacher_code), None)
        if not teacher:
            return True
            
        min_free_periods = teacher.get('min_free_periods_per_day', 2)
        assigned_periods = self.teacher_daily_periods[teacher_code][day]
        available_periods = self.periods_per_day - len(self.break_periods)
        
        # Check if we can still assign more periods while maintaining free periods
        max_assignable_periods = available_periods - min_free_periods
        return assigned_periods < max_assignable_periods

    def check_consecutive_periods(self, teacher_code, day, period):
        """Check if assigning this period would violate max consecutive constraint"""
        teacher = next((t for t in self.teachers if t['code'] == teacher_code), None)
        if not teacher:
            return True
            
        max_consecutive = teacher.get('max_consecutive', 3)
        
        # Count consecutive periods before and after this period
        consecutive_count = 1
        
        # Count backwards
        check_period = period - 1
        while check_period >= 1 and check_period not in self.break_periods:
            if self.teacher_schedules[teacher_code][day].get(check_period):
                consecutive_count += 1
                check_period -= 1
            else:
                break
        
        # Count forwards
        check_period = period + 1
        while check_period <= self.periods_per_day and check_period not in self.break_periods:
            if self.teacher_schedules[teacher_code][day].get(check_period):
                consecutive_count += 1
                check_period += 1
            else:
                break
        
        return consecutive_count <= max_consecutive

    def generate_timetable(self):
        """Main timetable generation method"""
        try:
            # Initialize timetables for all classes with proper day ordering
            for cls in self.classes:
                class_name = cls['name']
                self.class_timetables[class_name] = {}
                
                # Use ordered days to maintain Monday->Sunday sequence
                for day in self.days:  # This maintains proper order
                    self.class_timetables[class_name][day] = []
                    
                    for period in range(1, self.periods_per_day + 1):
                        if period in self.break_periods:
                            self.class_timetables[class_name][day].append([{
                                "subject": "BREAK",
                                "teacher": "---",
                                "teacher_code": "",
                                "is_combined": False,
                                "needs_lab": False
                            }])
                        else:
                            self.class_timetables[class_name][day].append([{
                                "subject": "FREE",
                                "teacher": "---",
                                "teacher_code": "",
                                "is_combined": False,
                                "needs_lab": False
                            }])
            
            # Group subjects by class
            subjects_by_class = defaultdict(list)
            for subject in self.subjects:
                subjects_by_class[subject['class_name']].append(subject)
            
            # Generate timetable for each class in order
            for cls in self.classes:
                class_name = cls['name']
                class_subjects = subjects_by_class.get(class_name, [])
                
                if class_subjects:
                    self.allocate_subjects_to_class(class_name, class_subjects)
            
            # Generate teacher timetables with proper day ordering
            teacher_timetables = self.generate_teacher_timetables()
            
            return self.class_timetables, teacher_timetables
            
        except Exception as e:
            logger.error(f"Error in timetable generation: {e}")
            raise
    
    def allocate_subjects_to_class(self, class_name, subjects):
        fixed_subjects = []
        flexible_subjects = []
        lab_subjects = []  # NEW: Track lab subjects separately
        
        # STEP 1: Separate fixed, flexible, and lab subjects
        for subject in subjects:
            hours_per_week = subject.get('hours_per_week', 4)
            fixed_period = subject.get('fixed_period')
            is_lab = subject.get('needs_lab', False) or subject.get('subject_type') == 'practical'
            
            if is_lab:
                # Lab subjects need consecutive periods - handle separately
                lab_subjects.append({
                    **subject, 
                    'is_lab': True,
                    'hours_needed': hours_per_week
                })
            elif fixed_period and fixed_period not in self.break_periods:
                fixed_subjects.append({
                    **subject, 
                    'is_fixed': True,
                    'hours_needed': hours_per_week
                })
            else:
                # No fixed period - all hours are flexible
                for _ in range(hours_per_week):
                    flexible_subjects.append({**subject, 'is_fixed': False})
        
        unassigned_fixed_subjects=[]
        
        # STEP 2: Assign fixed periods first
        for subject in fixed_subjects:
            fixed_period = subject.get('fixed_period')
            hours_needed = subject.get('hours_needed', 4)
            
            if not fixed_period or fixed_period in self.break_periods:
                unassigned_fixed_subjects.append(subject)
                continue
            
            assigned_count = 0
            
            # Try to assign this fixed subject to ALL working days
            for day in self.days:
                period_idx = fixed_period - 1
                
                # Check if period index is valid
                if period_idx >= len(self.class_timetables[class_name][day]):
                    continue
                    
                current_slot = self.class_timetables[class_name][day][period_idx]
                
                # Check if slot is free
                if current_slot[0]["subject"] == "FREE":
                    teacher_code = subject['teacher_code']
                    
                    # Check teacher availability with relaxed constraints for fixed periods
                    if self.can_assign_fixed_period(teacher_code, day, fixed_period, subject):
                        teacher_name = subject.get('teacher_name', self.get_teacher_name(teacher_code))
                        
                        # Assign the subject to fixed period
                        self.class_timetables[class_name][day][period_idx] = [{
                            "subject": subject['name'],
                            "teacher": teacher_name,
                            "teacher_code": teacher_code,
                            "is_combined": bool(subject.get('is_combined', False)),
                            "needs_lab": bool(subject.get('needs_lab', False)),
                            "subject_type": subject.get('subject_type', 'theory'),
                            "is_fixed": True
                        }]
                        
                        # Update teacher schedule
                        self.teacher_schedules[teacher_code][day][fixed_period] = {
                            "subject": subject['name'],
                            "class": class_name,
                            "is_combined": bool(subject.get('is_combined', False)),
                            "needs_lab": bool(subject.get('needs_lab', False))
                        }
                        
                        # Update tracking
                        self.teacher_weekly_hours[teacher_code] += 1
                        self.teacher_daily_periods[teacher_code][day] += 1
                        assigned_count += 1
                        print(f"Fixed: {subject['name']} assigned to {class_name} on {day} Period {fixed_period}")
                        
                        # Stop if we've assigned all required hours
                        if assigned_count >= hours_needed:
                            break
            
            # If we couldn't assign all required fixed hours, add remaining as flexible
            if assigned_count < hours_needed:
                remaining_hours = hours_needed - assigned_count
                for _ in range(remaining_hours):
                    flexible_subjects.append({**subject, 'is_fixed': False})
                print(f"Could only assign {assigned_count}/{hours_needed} fixed periods for {subject['name']}")
        
        # STEP 3: NEW - Assign lab subjects (consecutive periods)
        for lab_subject in lab_subjects:
            self.assign_consecutive_lab_periods(class_name, lab_subject)          
                  
        # STEP 4: Assign flexible subjects to remaining slots
        random.shuffle(flexible_subjects)
        
        # Track subject distribution to ensure proper spacing
        subject_last_assigned = defaultdict(lambda: {'day': -1, 'period': -1})
        
        # Assign subjects to available slots
        pool_index = 0
        
        for day_idx, day in enumerate(self.days):
            for period in range(1, self.periods_per_day + 1):
                # Skip break periods
                if period in self.break_periods:
                    continue
                
                period_idx = period - 1  # Convert to 0-based index for array
                
                # Skip if slot is already occupied
                if self.class_timetables[class_name][day][period_idx][0]["subject"] != "FREE":
                    continue
                
                if pool_index >= len(flexible_subjects):
                    break  # No more subjects to assign
                
                subject = flexible_subjects[pool_index]
                
                # Check if we can assign this subject (avoid consecutive if possible)
                subject_gap = self.constraints.get('subject_gap', 1)
                
                if subject_gap > 0:
                    last_assigned = subject_last_assigned[subject['name']]
                    if (last_assigned['day'] == day_idx and 
                        abs(last_assigned['period'] - period) < subject_gap):
                        # Try to find a better subject from remaining pool
                        better_subject = self.find_better_subject(
                            flexible_subjects[pool_index:], subject_last_assigned, day_idx, period
                        )
                        if better_subject:
                            subject = better_subject
                            # Move this subject to current position in pool
                            better_index = pool_index + flexible_subjects[pool_index:].index(better_subject)
                            flexible_subjects[pool_index], flexible_subjects[better_index] = flexible_subjects[better_index], flexible_subjects[pool_index]
                
                # Check teacher availability
                teacher_code = subject['teacher_code']
                if self.is_teacher_available(teacher_code, day, period):
                    # Get teacher name
                    teacher_name = subject.get('teacher_name', self.get_teacher_name(teacher_code))
                    
                    # Assign the subject
                    self.class_timetables[class_name][day][period_idx] = [{
                        "subject": subject['name'],
                        "teacher": teacher_name,
                        "teacher_code": teacher_code,
                        "is_combined": bool(subject.get('is_combined', False)),
                        "needs_lab": bool(subject.get('needs_lab', False)),
                        "subject_type": subject.get('subject_type', 'theory'),
                        "is_fixed": False
                    }]
                    
                    # Update teacher schedule
                    self.teacher_schedules[teacher_code][day][period] = {
                        "subject": subject['name'],
                        "class": class_name,
                        "is_combined": bool(subject.get('is_combined', False)),
                        "needs_lab": bool(subject.get('needs_lab', False))
                    }
                    
                    # Update tracking
                    subject_last_assigned[subject['name']] = {'day': day_idx, 'period': period}
                    self.teacher_weekly_hours[teacher_code] += 1
                    self.teacher_daily_periods[teacher_code][day] += 1
                    
                    pool_index += 1
    
    def assign_consecutive_lab_periods(self, class_name, lab_subject):
        """Assign consecutive periods for lab subjects"""
        hours_needed = lab_subject.get('hours_needed', 3)
        teacher_code = lab_subject['teacher_code']
        teacher_name = lab_subject.get('teacher_name', self.get_teacher_name(teacher_code))
        
        # Try to find 3 consecutive free periods in a single day
        for day in self.days:
            consecutive_slots = []
            
            # Look for consecutive available periods
            for start_period in range(1, self.periods_per_day - hours_needed + 2):
                consecutive_slots = []
                
                # Check if we can get required consecutive periods
                for period_offset in range(hours_needed):
                    period = start_period + period_offset
                    
                    # Skip break periods
                    if period in self.break_periods:
                        break
                    
                    period_idx = period - 1
                    
                    # Check if period exists and is free
                    if (period_idx < len(self.class_timetables[class_name][day]) and
                        self.class_timetables[class_name][day][period_idx][0]["subject"] == "FREE"):
                        
                        # Check teacher availability
                        if self.is_teacher_available_for_lab(teacher_code, day, period):
                            consecutive_slots.append((period, period_idx))
                        else:
                            break
                    else:
                        break
                
                # If we found enough consecutive slots, assign them
                if len(consecutive_slots) == hours_needed:
                    for i, (period, period_idx) in enumerate(consecutive_slots):
                        # Assign the lab period
                        self.class_timetables[class_name][day][period_idx] = [{
                            "subject": f"{lab_subject['name']} (Lab {i+1}/3)",
                            "teacher": teacher_name,
                            "teacher_code": teacher_code,
                            "is_combined": bool(lab_subject.get('is_combined', False)),
                            "needs_lab": True,
                            "subject_type": "practical",
                            "is_consecutive_lab": True,
                            "lab_session": i+1
                        }]
                        
                        # Update teacher schedule
                        self.teacher_schedules[teacher_code][day][period] = {
                            "subject": f"{lab_subject['name']} (Lab {i+1}/3)",
                            "class": class_name,
                            "is_combined": bool(lab_subject.get('is_combined', False)),
                            "needs_lab": True,
                            "is_consecutive_lab": True
                        }
                        
                        # Update tracking
                        self.teacher_weekly_hours[teacher_code] += 1
                        self.teacher_daily_periods[teacher_code][day] += 1
                    
                    print(f"Lab: {lab_subject['name']} assigned to {class_name} on {day} Periods {start_period}-{start_period+hours_needed-1}")
                    return True  # Successfully assigned
        
        # If no consecutive slots found, fall back to individual periods
        print(f"Warning: Could not find {hours_needed} consecutive periods for lab {lab_subject['name']} in {class_name}")
        self.assign_lab_as_individual_periods(class_name, lab_subject)
        return False

    def is_teacher_available_for_lab(self, teacher_code, day, period):
        """Check if teacher is available for lab period with relaxed constraints"""
        # Basic availability check
        if self.teacher_schedules[teacher_code][day].get(period) is not None:
            return False
        
        # For lab sessions, we're more flexible with consecutive period limits
        teacher = next((t for t in self.teachers if t['code'] == teacher_code), None)
        if teacher and self.teacher_weekly_hours[teacher_code] >= teacher.get('working_hours', 20):
            return False
        
        return True

    def assign_lab_as_individual_periods(self, class_name, lab_subject):
        """Fallback: assign lab as individual periods if consecutive not possible"""
        hours_needed = lab_subject.get('hours_needed', 3)
        assigned_count = 0
        
        for day in self.days:
            if assigned_count >= hours_needed:
                break
                
            for period in range(1, self.periods_per_day + 1):
                if assigned_count >= hours_needed:
                    break
                    
                if period in self.break_periods:
                    continue
                    
                period_idx = period - 1
                teacher_code = lab_subject['teacher_code']
                
                # Check if slot is free and teacher available
                if (period_idx < len(self.class_timetables[class_name][day]) and
                    self.class_timetables[class_name][day][period_idx][0]["subject"] == "FREE" and
                    self.is_teacher_available_for_lab(teacher_code, day, period)):
                    
                    teacher_name = lab_subject.get('teacher_name', self.get_teacher_name(teacher_code))
                    
                    # Assign the lab period
                    self.class_timetables[class_name][day][period_idx] = [{
                        "subject": f"{lab_subject['name']} (Lab)",
                        "teacher": teacher_name,
                        "teacher_code": teacher_code,
                        "is_combined": bool(lab_subject.get('is_combined', False)),
                        "needs_lab": True,
                        "subject_type": "practical",
                        "is_consecutive_lab": False
                    }]
                    
                    # Update teacher schedule
                    self.teacher_schedules[teacher_code][day][period] = {
                        "subject": f"{lab_subject['name']} (Lab)",
                        "class": class_name,
                        "is_combined": bool(lab_subject.get('is_combined', False)),
                        "needs_lab": True
                    }
                    
                    # Update tracking
                    self.teacher_weekly_hours[teacher_code] += 1
                    self.teacher_daily_periods[teacher_code][day] += 1
                    assigned_count += 1
        
        print(f"Lab fallback: {assigned_count}/{hours_needed} periods assigned for {lab_subject['name']} in {class_name}")
                    
    def can_assign_fixed_period(self, teacher_code, day, period, subject):
        """Special check for fixed periods that bypasses some constraints"""
        
        # Basic availability check - teacher shouldn't already be assigned this period
        if self.teacher_schedules[teacher_code][day].get(period) is not None:
            return False
        
        # Check if teacher is qualified to teach this subject
        teacher = next((t for t in self.teachers if t['code'] == teacher_code), None)
        if not teacher:
            return False
        
        # For fixed periods, we relax some constraints but still check basic ones
        
        # Check if teacher has exceeded weekly hours
        max_hours = teacher.get('working_hours', 20)
        if self.teacher_weekly_hours[teacher_code] >= max_hours:
            return False
        
        # Check consecutive periods constraint (but be more lenient for fixed periods)
        teacher_obj = next((t for t in self.teachers if t['code'] == teacher_code), None)
        if teacher_obj:
            max_consecutive = teacher_obj.get('max_consecutive', 3)
            # Count consecutive periods around this fixed period
            consecutive_count = 1
            
            # Count backwards
            check_period = period - 1
            while check_period >= 1 and check_period not in self.break_periods:
                if self.teacher_schedules[teacher_code][day].get(check_period):
                    consecutive_count += 1
                    check_period -= 1
                else:
                    break
            
            # Count forwards
            check_period = period + 1
            while check_period <= self.periods_per_day and check_period not in self.break_periods:
                if self.teacher_schedules[teacher_code][day].get(check_period):
                    consecutive_count += 1
                    check_period += 1
                else:
                    break
            
            if consecutive_count > max_consecutive + 1:  # Allow one extra for fixed periods
                return False
        
        return True
    
    def find_better_subject(self, remaining_subjects, subject_last_assigned, current_day, current_period):
        """Find a better subject that doesn't violate gap constraints"""
        subject_gap = self.constraints.get('subject_gap', 1)
        
        for subject in remaining_subjects:
            last_assigned = subject_last_assigned[subject['name']]
            if (last_assigned['day'] != current_day or 
                abs(last_assigned['period'] - current_period) >= subject_gap):
                return subject
        return None
    
    def is_teacher_available(self, teacher_code, day, period):
        """Check if teacher is available at the given time with all constraints"""
        # Basic availability check
        if self.teacher_schedules[teacher_code][day].get(period) is not None:
            return False
        
        # Check free periods constraint
        if not self.check_teacher_free_periods(teacher_code, day):
            return False
        
        # Check consecutive periods constraint
        if not self.check_consecutive_periods(teacher_code, day, period):
            return False
        
        # Check weekly hours limit
        teacher = next((t for t in self.teachers if t['code'] == teacher_code), None)
        if teacher and self.teacher_weekly_hours[teacher_code] >= teacher.get('working_hours', 20):
            return False
        
        return True
    
    def get_teacher_name(self, teacher_code):
        """Get teacher name from teacher code"""
        for teacher in self.teachers:
            if teacher['code'] == teacher_code:
                return teacher['name']
        return "Unknown Teacher"
    
    def generate_teacher_timetables(self):
        """Generate individual teacher timetables from class schedules with combined class detection"""
        teacher_timetables = {}
        
        # First, detect combined classes by tracking teacher assignments
        teacher_period_assignments = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
        
        # Scan all class timetables to build teacher assignment map
        for class_name, schedule in self.class_timetables.items():
            for day in self.days:
                for period in range(1, self.periods_per_day + 1):
                    period_idx = period - 1
                    if period_idx < len(schedule[day]):
                        slot = schedule[day][period_idx][0]
                        if slot["subject"] not in ["FREE", "BREAK"]:
                            teacher_code = slot.get("teacher_code", "")
                            if teacher_code:
                                teacher_period_assignments[teacher_code][day][period].append({
                                    'class': class_name,
                                    'subject': slot["subject"],
                                    'is_combined': slot.get("is_combined", False)
                                })
        
        # Generate teacher timetables
        for teacher in self.teachers:
            teacher_code = teacher['code']
            teacher_name = teacher['name']
            
            teacher_timetables[f"{teacher_name} ({teacher_code})"] = {}
            
            for day in self.days:
                teacher_timetables[f"{teacher_name} ({teacher_code})"][day] = []
                
                for period in range(1, self.periods_per_day + 1):
                    if period in self.break_periods:
                        teacher_timetables[f"{teacher_name} ({teacher_code})"][day].append([{
                            "subject": "BREAK",
                            "class": "---",
                            "is_combined": False,
                            "needs_lab": False
                        }])
                    else:
                        assignments = teacher_period_assignments[teacher_code][day].get(period, [])
                        
                        if assignments:
                            # Check if it's a combined class (same teacher, same subject, multiple classes)
                            if len(assignments) > 1:
                                # Check if all assignments are for the same subject
                                subjects = set(assignment['subject'] for assignment in assignments)
                                if len(subjects) == 1:
                                    # Combined class detected
                                    combined_classes = [assignment['class'] for assignment in assignments]
                                    teacher_timetables[f"{teacher_name} ({teacher_code})"][day].append([{
                                        "subject": assignments[0]['subject'],
                                        "class": " + ".join(sorted(combined_classes)),
                                        "is_combined": True,
                                        "needs_lab": assignments[0].get('needs_lab', False)
                                    }])
                                else:
                                    # Multiple different subjects - take first one (shouldn't happen in good timetable)
                                    assignment = assignments[0]
                                    teacher_timetables[f"{teacher_name} ({teacher_code})"][day].append([{
                                        "subject": assignment['subject'],
                                        "class": assignment['class'],
                                        "is_combined": False,
                                        "needs_lab": assignment.get('needs_lab', False)
                                    }])
                            else:
                                # Single class assignment
                                assignment = assignments[0]
                                teacher_timetables[f"{teacher_name} ({teacher_code})"][day].append([{
                                    "subject": assignment['subject'],
                                    "class": assignment['class'],
                                    "is_combined": assignment.get('is_combined', False),
                                    "needs_lab": assignment.get('needs_lab', False)
                                }])
                        else:
                            # Free period
                            teacher_timetables[f"{teacher_name} ({teacher_code})"][day].append([{
                                "subject": "FREE",
                                "class": "---",
                                "is_combined": False,
                                "needs_lab": False
                            }])
        
        return teacher_timetables

# API Endpoints
@app.route('/api/save_department', methods=['POST'])
def save_department():
    """Save department information"""
    try:
        data = request.get_json()
        if not data:
            return jsonify(error="No JSON data provided"), 400
            
        validation_error = validate_required_fields(data, ['name', 'code'])
        if validation_error:
            return jsonify(error=validation_error), 400

        execute_query(
            "INSERT INTO departments (name, code) VALUES (%s, %s)",
            (data['name'].strip(), data['code'].strip().upper())
        )
        return jsonify(success=True)
    except Error as e:
        if e.errno == 1062:  # Duplicate entry
            return jsonify(error=f"Database error: {str(e)}"), 500
    except Exception as e:
        logger.error(f"Unexpected error in save_department: {e}")
        return jsonify(error="An unexpected error occurred"), 500

@app.route('/api/save_teacher', methods=['POST'])
def save_teacher():
    try:
        data = request.get_json()
        if not data:
            return jsonify(error="No JSON data provided"), 400

        validation_error = validate_required_fields(data, ['name', 'code', 'subjects', 'department_code'])
        if validation_error:
            return jsonify(error=validation_error), 400

        # Get department_id
        department_code = data['department_code'].strip().upper()
        db = get_db()
        cursor = db.cursor(dictionary=True)
        
        try:
            cursor.execute("SELECT id FROM departments WHERE code = %s", (department_code,))
            dept_result = cursor.fetchone()
            if not dept_result:
                return jsonify(error=f"Department {department_code} not found"), 404
            department_id = dept_result['id']

            # Process subjects
            subjects = data['subjects']
            if isinstance(subjects, str):
                subjects = [s.strip() for s in subjects.split(',') if s.strip()]
            elif not isinstance(subjects, list):
                return jsonify(error="Subjects must be a list or comma-separated string"), 400
            
            if not subjects:
                return jsonify(error="At least one subject is required"), 400

            # Validate numeric fields
            working_hours = data.get('working_hours', 20)
            max_consecutive = data.get('max_consecutive', 3)
            min_free_periods = data.get('min_free_periods', 2)
            
            if not isinstance(working_hours, int) or working_hours < 1:
                return jsonify(error="Working hours must be a positive integer"), 400
            if not isinstance(max_consecutive, int) or max_consecutive < 1:
                return jsonify(error="Max consecutive periods must be a positive integer"), 400
            if not isinstance(min_free_periods, int) or min_free_periods < 1:
                return jsonify(error="Min free periods must be a positive integer"), 400

            # First check if teacher exists
            cursor.execute("SELECT id FROM teachers WHERE code = %s", (data['code'].strip().upper(),))
            existing_teacher = cursor.fetchone()
            
            if existing_teacher:
                # Teacher exists - update instead of insert
                cursor.execute(
                    """UPDATE teachers SET 
                    name = %s, 
                    working_hours = %s, 
                    max_consecutive = %s,
                    min_free_periods_per_day = %s,
                    department_id = %s
                    WHERE code = %s""",
                    (data['name'].strip(), 
                     working_hours,
                     max_consecutive,
                     min_free_periods,
                     department_id,
                     data['code'].strip().upper())
                )
                teacher_id = existing_teacher['id']
                
                # Delete existing subjects and re-add them
                cursor.execute("DELETE FROM teacher_subjects WHERE teacher_id = %s", (teacher_id,))
            else:
                # New teacher - insert
                cursor.execute(
                    """INSERT INTO teachers 
                    (name, code, working_hours, max_consecutive, min_free_periods_per_day, department_id) 
                    VALUES (%s, %s, %s, %s, %s, %s)""",
                    (data['name'].strip(), 
                     data['code'].strip().upper(),
                     working_hours,
                     max_consecutive,
                     min_free_periods,
                     department_id)
                )
                teacher_id = cursor.lastrowid

            # Save subjects
            for subject in subjects:
                subject = subject.strip()
                if subject:
                    cursor.execute(
                        """INSERT INTO teacher_subjects 
                        (teacher_id, subject_name) 
                        VALUES (%s, %s)""",
                        (teacher_id, subject)
                    )

            db.commit()
            return jsonify(success=True, teacher_id=teacher_id)

        except Error as err:
            db.rollback()
            if err.errno == 1062:  # Duplicate entry
                return jsonify(error=f"Teacher with code '{data['code']}' already exists. Updating instead."), 400
            raise err
        finally:
            cursor.close()
    except Error as e:
        return jsonify(error=f"Database error: {str(e)}"), 500
    except Exception as e:
        logger.error(f"Unexpected error in save_teacher: {e}")
        return jsonify(error="An unexpected error occurred"), 500
    
@app.route('/api/get_teachers/<dept_code>', methods=['GET'])
def get_teachers(dept_code):
    """Get all teachers with their subjects for a specific department"""
    try:
        teachers = execute_query('''
            SELECT t.*, GROUP_CONCAT(ts.subject_name SEPARATOR ',') as subjects 
            FROM teachers t
            LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id
            JOIN departments d ON t.department_id = d.id
            WHERE t.is_active = TRUE AND d.code = %s
            GROUP BY t.id, t.name, t.code, t.working_hours, t.max_consecutive, t.min_free_periods_per_day
            ORDER BY t.name
        ''', (dept_code.upper(),), fetch=True)
        
        # Format subjects as array
        for teacher in teachers:
            if teacher['subjects']:
                teacher['subjects'] = [s.strip() for s in teacher['subjects'].split(',')]
            else:
                teacher['subjects'] = []
                
        return jsonify(teachers)
    except Error as e:
        return jsonify(error=f"Database error: {str(e)}"), 500

@app.route('/api/save_class', methods=['POST'])
def save_class():
    try:
        data = request.get_json()
        if not data:
            return jsonify(error="No JSON data provided"), 400

        # Validate required fields with proper None checks
        validation_error = validate_required_fields(data, ['name', 'year', 'department_code'])
        if validation_error:
            return jsonify(error=validation_error), 400

        # Get department_id
        department_code = data['department_code'].strip().upper()
        db = get_db()
        cursor = db.cursor(dictionary=True)
        
        try:
            cursor.execute("SELECT id FROM departments WHERE code = %s", (department_code,))
            dept_result = cursor.fetchone()
            if not dept_result:
                return jsonify(error=f"Department {department_code} not found"), 404
            department_id = dept_result['id']

            # Safely get and clean data
            class_name = data['name'].strip() if data.get('name') else None
            division = data.get('division', '').strip() if data.get('division') else None
            shift = data.get('shift', 'Morning').strip() if data.get('shift') else 'Morning'
            
            try:
                year = int(data['year'])
                if year < 1 or year > 4:
                    return jsonify(error="Year must be between 1 and 4"), 400
            except (ValueError, TypeError):
                return jsonify(error="Year must be a valid number"), 400

            # Check if class exists using the cleaned name
            cursor.execute("SELECT id FROM classes WHERE name = %s", (class_name,))
            existing_class = cursor.fetchone()

            if existing_class:
                # Update existing class
                cursor.execute(
                    """UPDATE classes SET
                    year = %s,
                    division = %s,
                    shift = %s,
                    department_id = %s,
                    is_active = TRUE
                    WHERE name = %s""",
                    (year, division, shift, department_id, class_name)
                )
                class_id = existing_class['id']
            else:
                # Insert new class
                cursor.execute(
                    """INSERT INTO classes 
                    (name, year, division, shift, department_id) 
                    VALUES (%s, %s, %s, %s, %s)""",
                    (class_name, year, division, shift, department_id)
                )
                class_id = cursor.lastrowid

            db.commit()
            return jsonify(success=True, class_id=class_id)

        except Error as e:
            db.rollback()
            logger.error(f"Database error in save_class: {e}")
            return jsonify(error=f"Database error: {str(e)}"), 500
        finally:
            cursor.close()

    except Exception as e:
        logger.error(f"Unexpected error in save_class: {e}")
        return jsonify(error=f"An unexpected error occurred: {str(e)}"), 500
    
@app.route('/api/get_classes/<dept_code>', methods=['GET'])
def get_classes(dept_code):
    """Get all classes for a specific department"""
    try:
        classes = execute_query('''
            SELECT c.* FROM classes c
            JOIN departments d ON c.department_id = d.id
            WHERE c.is_active = TRUE AND d.code = %s
            ORDER BY c.year, c.name
        ''', (dept_code.upper(),), fetch=True)
        return jsonify(classes)
    except Error as e:
        return jsonify(error=f"Database error: {str(e)}"), 500

@app.route('/api/save_subject', methods=['POST'])
def save_subject():
    try:
        data = request.get_json()
        if not data:
            return jsonify(error="No JSON data provided"), 400

        required_fields = ['name', 'class_id', 'teacher_code']
        validation_error = validate_required_fields(data, required_fields)
        if validation_error:
            return jsonify(error=validation_error), 400
        
        # Validate teacher exists
        db = get_db()
        cursor = db.cursor(dictionary=True)

        try:
            # Get class ID from class name - ensure we convert to string
            class_id_input = str(data['class_id']).strip()
            cursor.execute("SELECT id FROM classes WHERE name = %s", (class_id_input,))
            class_record = cursor.fetchone()
            
            if not class_record:
                return jsonify(error=f"Class '{data['class_id']}' not found"), 404

            # Check if subject already exists for this class and teacher
            subject_name = str(data['name']).strip()
            teacher_code = str(data['teacher_code']).strip().upper()
            
            cursor.execute(
                """SELECT id FROM subjects 
                WHERE name = %s AND class_id = %s AND teacher_code = %s""",
                (subject_name, class_record['id'], teacher_code)
            )
            existing_subject = cursor.fetchone()

            if existing_subject:
                # Update existing subject
                cursor.execute(
                    """UPDATE subjects SET
                    hours_per_week = %s,
                    needs_lab = %s,
                    fixed_period = %s,
                    is_combined = %s,
                    subject_type = %s
                    WHERE id = %s""",
                    (int(data.get('hours_per_week', 4)),
                    bool(data.get('needs_lab', False)),
                    int(data['fixed_period']) if data.get('fixed_period') else None,
                    bool(data.get('is_combined', False)),
                    data.get('subject_type', 'theory'),
                    existing_subject['id'])
                )
            else:
                # Insert new subject
                cursor.execute(
                    """INSERT INTO subjects 
                    (name, class_id, teacher_code, hours_per_week, needs_lab, fixed_period, is_combined, subject_type) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (subject_name,
                     class_record['id'],
                     teacher_code,
                     int(data.get('hours_per_week', 4)),
                     bool(data.get('needs_lab', False)),
                     int(data['fixed_period']) if data.get('fixed_period') else None,
                     bool(data.get('is_combined', False)),
                     data.get('subject_type', 'theory'))
                )

            db.commit()
            return jsonify(success=True)

        except Error as e:
            db.rollback()
            logger.error(f"Database error in save_subject: {e}")
            return jsonify(error=f"Database error: {str(e)}"), 500
        finally:
            cursor.close()

    except Exception as e:
        logger.error(f"Unexpected error in save_subject: {e}")
        return jsonify(error=f"An unexpected error occurred: {str(e)}"), 500
    
@app.route('/api/get_subjects/<dept_code>', methods=['GET'])
def get_subjects(dept_code):
    """Get all unique subjects for a specific department"""
    try:
        subjects = execute_query('''
            SELECT DISTINCT ts.subject_name 
            FROM teacher_subjects ts
            JOIN teachers t ON ts.teacher_id = t.id
            JOIN departments d ON t.department_id = d.id
            WHERE d.code = %s
            ORDER BY ts.subject_name
        ''', (dept_code.upper(),), fetch=True)
        return jsonify([s['subject_name'] for s in subjects])
    except Error as e:
        return jsonify(error=f"Database error: {str(e)}"), 500

@app.route('/api/get_teachers_for_subject/<dept_code>/<subject>', methods=['GET'])
def get_teachers_for_subject(dept_code, subject):
    """Get teachers who can teach a specific subject in a department"""
    try:
        teachers = execute_query('''
            SELECT t.code, t.name 
            FROM teachers t
            JOIN teacher_subjects ts ON t.id = ts.teacher_id
            JOIN departments d ON t.department_id = d.id
            WHERE ts.subject_name = %s AND t.is_active = TRUE AND d.code = %s
            ORDER BY t.name
        ''', (subject, dept_code.upper()), True)
        return jsonify(teachers)
    except Error as e:
        return jsonify(error=f"Database error: {str(e)}"), 500

@app.route('/api/get_subjects_with_teachers/<dept_code>', methods=['GET'])
def get_subjects_with_teachers(dept_code):
    """Get subjects grouped with their available teachers for a department"""
    try:
        subject_teachers = execute_query('''
            SELECT ts.subject_name as subject, t.code, t.name
            FROM teacher_subjects ts
            JOIN teachers t ON ts.teacher_id = t.id
            JOIN departments d ON t.department_id = d.id
            WHERE t.is_active = TRUE AND d.code = %s
            ORDER BY ts.subject_name, t.name
        ''', (dept_code.upper(),), fetch=True)
        
        # Group by subject
        result = defaultdict(list)
        for row in subject_teachers:
            result[row['subject']].append({
                'code': row['code'],
                'name': row['name']
            })
            
        return jsonify(dict(result))
    except Error as e:
        return jsonify(error=f"Database error: {str(e)}"), 500

@app.route('/api/save_constraints', methods=['POST'])
def save_constraints():
    """Save timetable constraints"""
    try:
        data = request.get_json()
        if not data:
            return jsonify(error="No JSON data provided"), 400
            
        required_fields = ['working_days', 'periods_per_day', 'department_code']
        validation_error = validate_required_fields(data, required_fields)
        if validation_error:
            return jsonify(error=validation_error), 400

        # Validate constraints
        working_days = int(data['working_days'])
        periods_per_day = int(data['periods_per_day'])
        
        if working_days < 1 or working_days > 7:
            return jsonify(error="Working days must be between 1 and 7"), 400
        if periods_per_day < 1 or periods_per_day > 12:
            return jsonify(error="Periods per day must be between 1 and 12"), 400

        # Get department_id
        department_code = data['department_code'].strip().upper()
        db = get_db()
        cursor = db.cursor(dictionary=True)
        
        try:
            cursor.execute("SELECT id FROM departments WHERE code = %s", (department_code,))
            dept_result = cursor.fetchone()
            if not dept_result:
                return jsonify(error=f"Department {department_code} not found"), 404
            department_id = dept_result['id']

            # Fix the break_periods handling
            break_periods = data.get('break_periods')
            if break_periods is not None:
                break_periods = break_periods.strip() or None
            else:
                break_periods = None

            execute_query(
                """INSERT INTO constraints (working_days, periods_per_day, break_periods, subject_gap, department_id) 
                VALUES (%s, %s, %s, %s, %s)""",
                (working_days, 
                 periods_per_day, 
                 break_periods,
                 int(data.get('subject_gap', 1)),
                 department_id)
            )
            return jsonify(success=True)
        finally:
            cursor.close()
            
    except (ValueError, TypeError) as e:
        return jsonify(error="Invalid numeric values provided"), 400
    except Error as e:
        return jsonify(error=f"Database error: {str(e)}"), 500
    except Exception as e:
        logger.error(f"Unexpected error in save_constraints: {e}")
        return jsonify(error="An unexpected error occurred"), 500
    
@app.route('/api/department_timetables/<dept_code>', methods=['GET'])
def get_department_timetables(dept_code):
    """Get all timetables for a department"""
    try:
        # In a real implementation, you would fetch from database
        # For now, return empty array - data will come from localStorage on frontend
        return jsonify([])
    except Exception as e:
        logger.error(f"Error getting department timetables: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/timetables/<dept_code>/<int:timetable_id>', methods=['DELETE'])
def delete_department_timetable(dept_code, timetable_id):
    """Delete a specific timetable"""
    try:
        # In a real implementation, you would delete from database
        # For now, return success - deletion will be handled on frontend
        return jsonify(success=True)
    except Exception as e:
        logger.error(f"Error deleting timetable: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/check_department', methods=['GET'])
def check_department():
    """Check if department exists and get its data"""
    try:
        dept_code = request.args.get('code', '').upper()
        if not dept_code:
            return jsonify(error="Department code is required"), 400
            
        # Check if department exists in database
        department = execute_query(
            "SELECT * FROM departments WHERE code = %s", 
            (dept_code,), 
            fetch=True
        )
        
        if department:
            dept_info = department[0]
            
            # Get additional department statistics
            teachers_count = execute_query(
                "SELECT COUNT(*) as count FROM teachers WHERE department_id = %s AND is_active = TRUE",
                (dept_info['id'],), fetch=True
            )[0]['count']
            
            classes_count = execute_query(
                "SELECT COUNT(*) as count FROM classes WHERE department_id = %s AND is_active = TRUE",
                (dept_info['id'],), fetch=True
            )[0]['count']
            
            return jsonify({
                "exists": True,
                "department": {
                    **dept_info,
                    "teachers_count": teachers_count,
                    "classes_count": classes_count
                }
            })
        else:
            return jsonify({
                "exists": False,
                "department": None
            })
            
    except Exception as e:
        logger.error(f"Error checking department: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/delete_teachers/<dept_code>', methods=['DELETE'])
def delete_teachers(dept_code):
    """Delete all teachers for a specific department"""
    try:
        dept_code = dept_code.upper()
        
        # Get department info
        department = execute_query(
            "SELECT id FROM departments WHERE code = %s", 
            (dept_code,), 
            fetch=True
        )
        
        if not department:
            return jsonify(error=f"Department {dept_code} not found"), 404
            
        dept_id = department[0]['id']
        
        # Get all teacher IDs for this department
        teachers = execute_query(
            "SELECT id FROM teachers WHERE department_id = %s",
            (dept_id,),
            fetch=True
        )
        
        if teachers:
            teacher_ids = [str(teacher['id']) for teacher in teachers]
            
            # Delete teacher subjects first (foreign key constraint)
            execute_query(
                f"DELETE FROM teacher_subjects WHERE teacher_id IN ({','.join(['%s'] * len(teacher_ids))})",
                teacher_ids
            )
            
            # Delete teachers
            execute_query(
                "DELETE FROM teachers WHERE department_id = %s",
                (dept_id,)
            )
            
            logger.info(f"Deleted {len(teachers)} teachers and their subjects for department {dept_code}")
        
        return jsonify(success=True, message=f"All teachers deleted for department {dept_code}")
        
    except Error as e:
        logger.error(f"Database error deleting teachers for {dept_code}: {e}")
        return jsonify(error=f"Database error: {str(e)}"), 500
    except Exception as e:
        logger.error(f"Error deleting teachers for {dept_code}: {e}")
        return jsonify(error=f"An error occurred: {str(e)}"), 500

@app.route('/api/delete_classes/<dept_code>', methods=['DELETE'])
def delete_classes(dept_code):
    """Delete all classes for a specific department"""
    try:
        dept_code = dept_code.upper()
        
        # Get department info
        department = execute_query(
            "SELECT id FROM departments WHERE code = %s", 
            (dept_code,), 
            fetch=True
        )
        
        if not department:
            return jsonify(error=f"Department {dept_code} not found"), 404
            
        dept_id = department[0]['id']
        
        # Get all class IDs for this department
        classes = execute_query(
            "SELECT id FROM classes WHERE department_id = %s",
            (dept_id,),
            fetch=True
        )
        
        if classes:
            class_ids = [str(cls['id']) for cls in classes]
            
            # Delete subjects first (foreign key constraint)
            execute_query(
                f"DELETE FROM subjects WHERE class_id IN ({','.join(['%s'] * len(class_ids))})",
                class_ids
            )
            
            # Delete classes
            execute_query(
                "DELETE FROM classes WHERE department_id = %s",
                (dept_id,)
            )
            
            logger.info(f"Deleted {len(classes)} classes and their subjects for department {dept_code}")
        
        return jsonify(success=True, message=f"All classes deleted for department {dept_code}")
        
    except Error as e:
        logger.error(f"Database error deleting classes for {dept_code}: {e}")
        return jsonify(error=f"Database error: {str(e)}"), 500
    except Exception as e:
        logger.error(f"Error deleting classes for {dept_code}: {e}")
        return jsonify(error=f"An error occurred: {str(e)}"), 500

@app.route('/api/delete_constraints/<dept_code>', methods=['DELETE'])
def delete_constraints(dept_code):
    """Delete all constraints for a specific department"""
    try:
        dept_code = dept_code.upper()
        
        # Get department info
        department = execute_query(
            "SELECT id FROM departments WHERE code = %s", 
            (dept_code,), 
            fetch=True
        )
        
        if not department:
            return jsonify(error=f"Department {dept_code} not found"), 404
            
        dept_id = department[0]['id']
        
        # Delete constraints for this department
        result = execute_query(
            "DELETE FROM constraints WHERE department_id = %s",
            (dept_id,)
        )
        
        logger.info(f"Deleted constraints for department {dept_code}")
        
        return jsonify(success=True, message=f"All constraints deleted for department {dept_code}")
        
    except Error as e:
        logger.error(f"Database error deleting constraints for {dept_code}: {e}")
        return jsonify(error=f"Database error: {str(e)}"), 500
    except Exception as e:
        logger.error(f"Error deleting constraints for {dept_code}: {e}")
        return jsonify(error=f"An error occurred: {str(e)}"), 500

@app.route('/api/delete_department/<dept_code>', methods=['DELETE'])
def delete_entire_department(dept_code):
    """Delete entire department and all associated data"""
    try:
        dept_code = dept_code.upper()
        
        # Get department info
        department = execute_query(
            "SELECT id FROM departments WHERE code = %s", 
            (dept_code,), 
            fetch=True
        )
        
        if not department:
            return jsonify(error=f"Department {dept_code} not found"), 404
            
        dept_id = department[0]['id']
        
        # Delete in correct order to handle foreign key constraints
        db = get_db()
        cursor = db.cursor()
        
        try:
            # 1. Delete teacher subjects
            cursor.execute("""
                DELETE ts FROM teacher_subjects ts 
                JOIN teachers t ON ts.teacher_id = t.id 
                WHERE t.department_id = %s
            """, (dept_id,))
            
            # 2. Delete subjects
            cursor.execute("""
                DELETE s FROM subjects s 
                JOIN classes c ON s.class_id = c.id 
                WHERE c.department_id = %s
            """, (dept_id,))
            
            # 3. Delete teachers
            cursor.execute("DELETE FROM teachers WHERE department_id = %s", (dept_id,))
            
            # 4. Delete classes  
            cursor.execute("DELETE FROM classes WHERE department_id = %s", (dept_id,))
            
            # 5. Delete constraints
            cursor.execute("DELETE FROM constraints WHERE department_id = %s", (dept_id,))
            
            # 6. Finally delete the department itself
            cursor.execute("DELETE FROM departments WHERE id = %s", (dept_id,))
            
            db.commit()
            
            logger.info(f"Completely deleted department {dept_code} and all associated data")
            
            return jsonify(success=True, message=f"Department {dept_code} and all data deleted successfully")
            
        except Error as e:
            db.rollback()
            raise e
        finally:
            cursor.close()
        
    except Error as e:
        logger.error(f"Database error deleting department {dept_code}: {e}")
        return jsonify(error=f"Database error: {str(e)}"), 500
    except Exception as e:
        logger.error(f"Error deleting department {dept_code}: {e}")
        return jsonify(error=f"An error occurred: {str(e)}"), 500

@app.route('/api/generate_timetable/<dept_code>', methods=['POST'])
def generate_timetable(dept_code):
    """Generate timetable based on saved data for a specific department"""
    try:
        dept_code = dept_code.upper()
        
        # Get department info
        department = execute_query(
            "SELECT id FROM departments WHERE code = %s", 
            (dept_code,), 
            fetch=True
        )
        
        if not department:
            return jsonify(error=f"Department {dept_code} not found"), 404
            
        dept_id = department[0]['id']
        
        # Get all necessary data from database filtered by department
        classes = execute_query('''
            SELECT c.* FROM classes c
            WHERE c.department_id = %s AND c.is_active = TRUE
            ORDER BY c.year, c.name
        ''', (dept_id,), fetch=True)
        
        subjects = execute_query("""
            SELECT s.*, c.name as class_name, t.name as teacher_name 
            FROM subjects s 
            JOIN classes c ON s.class_id = c.id
            JOIN teachers t ON s.teacher_code = t.code
            WHERE c.department_id = %s AND c.is_active = TRUE AND t.is_active = TRUE
            ORDER BY 
                s.fixed_period IS NOT NULL DESC,
                c.name, 
                s.fixed_period ASC,
                s.name
        """, (dept_id,), fetch=True)
        
        teachers = execute_query("""
            SELECT t.* FROM teachers t
            WHERE t.department_id = %s AND t.is_active = TRUE
            ORDER BY t.name
        """, (dept_id,), fetch=True)
        
        constraints = execute_query(
            "SELECT * FROM constraints WHERE department_id = %s ORDER BY id DESC LIMIT 1", 
            (dept_id,), fetch=True
        )
        
        if not constraints:
            constraints = {
                'working_days': 5, 
                'periods_per_day': 6, 
                'break_periods': None, 
                'subject_gap': 1
            }
        else:
            constraints = constraints[0]
        
        if not classes:
            return jsonify(error="No classes defined. Please add at least one class."), 400
        if not subjects:
            return jsonify(error="No subjects defined. Please add subjects to classes."), 400
        if not teachers:
            return jsonify(error="No teachers defined. Please add at least one teacher."), 400

        # Generate timetables
        generator = TimetableGenerator(classes, subjects, constraints, teachers)
        class_timetables, teacher_timetables = generator.generate_timetable()
        
        # Combine both timetables
        all_timetables = {
            **class_timetables,
            **teacher_timetables
        }
        
        if not all_timetables:
            return jsonify(error="Could not generate timetable. Please check your data."), 400
            
        return jsonify(all_timetables)
        
    except Exception as e:
        logger.error(f"Unexpected error in generate_timetable: {e}")
        return jsonify(error=f"Timetable generation failed: {str(e)}"), 500

# Frontend routes
@app.route('/')
@app.route('/home')
def home():
    """Home page"""
    try:
        return send_from_directory(app.static_folder, 'home.html')
    except FileNotFoundError:
        return "Home page not found", 404

@app.route('/timetable')
def timetable_view():
    """Timetable display page"""
    timetable_data = request.args.get('data')
    if not timetable_data:
        return "No timetable data found", 400
    return render_template('timetable.html', timetable_data=timetable_data)

@app.route('/create-timetable')
def create_timetable():
    """Timetable creation page"""
    try:
        return send_from_directory(app.static_folder, 'index.html')
    except FileNotFoundError:
        return "Timetable creation page not found", 404

@app.route('/<path:filename>')
def static_files(filename):
    """Serve static files"""
    try:
        return send_from_directory(app.static_folder, filename)
    except FileNotFoundError:
        return f"File {filename} not found", 404

# Health check endpoint
@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        return jsonify(status="healthy", database="connected")
    except Exception as e:
        return jsonify(status="unhealthy", error=str(e)), 500

# Debug routes (remove in production)
@app.route('/debug/teachers/<dept_code>')
def debug_teachers(dept_code):
    """Debug: Show all teachers with subjects for a department"""
    try:
        teachers = execute_query('''
            SELECT t.name, t.code, GROUP_CONCAT(ts.subject_name SEPARATOR ', ') as subjects
            FROM teachers t
            LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id
            JOIN departments d ON t.department_id = d.id
            WHERE t.is_active = TRUE AND d.code = %s
            GROUP BY t.id, t.name, t.code
            ORDER BY t.name
        ''', (dept_code.upper(),), fetch=True)
        return jsonify(teachers)
    except Error as e:
        return jsonify(error=str(e)), 500

@app.route('/debug/classes/<dept_code>')
def debug_classes(dept_code):
    """Debug: Show all classes with subjects for a department"""
    try:
        classes = execute_query('''
            SELECT c.name as class_name, c.year, s.name as subject, s.teacher_code, s.hours_per_week
            FROM classes c
            LEFT JOIN subjects s ON c.id = s.class_id
            JOIN departments d ON c.department_id = d.id
            WHERE c.is_active = TRUE AND d.code = %s
            ORDER BY c.year, c.name, s.name
        ''', (dept_code.upper(),), fetch=True)
        return jsonify(classes)
    except Error as e:
        return jsonify(error=str(e)), 500

@app.route('/debug/timetable_data/<dept_code>')
def debug_timetable_data(dept_code):
    """Debug: Show all data needed for timetable generation for a department"""
    try:
        dept_code = dept_code.upper()
        department = execute_query(
            "SELECT id FROM departments WHERE code = %s", 
            (dept_code,), 
            fetch=True
        )
        
        if not department:
            return jsonify(error=f"Department {dept_code} not found"), 404
            
        dept_id = department[0]['id']
        
        data = {
            "department": execute_query("SELECT * FROM departments WHERE code = %s", (dept_code,), fetch=True),
            "classes": execute_query(
                "SELECT * FROM classes WHERE department_id = %s AND is_active = TRUE ORDER BY year, name", 
                (dept_id,), fetch=True
            ),
            "subjects": execute_query("""
                SELECT s.*, c.name as class_name, t.name as teacher_name 
                FROM subjects s 
                JOIN classes c ON s.class_id = c.id
                JOIN teachers t ON s.teacher_code = t.code
                WHERE c.department_id = %s AND c.is_active = TRUE AND t.is_active = TRUE
                ORDER BY c.name, s.name
            """, (dept_id,), fetch=True),
            "teachers": execute_query(
                "SELECT * FROM teachers WHERE department_id = %s AND is_active = TRUE ORDER BY name", 
                (dept_id,), fetch=True
            ),
            "constraints": execute_query(
                "SELECT * FROM constraints WHERE department_id = %s ORDER BY id DESC LIMIT 1", 
                (dept_id,), fetch=True
            )
        }
        return jsonify(data)
    except Error as e:
        return jsonify(error=str(e)), 500

# Additional API endpoints for better functionality
@app.route('/api/get_class_subjects/<dept_code>/<class_name>', methods=['GET'])
def get_class_subjects(dept_code, class_name):
    """Get all subjects for a specific class in a department"""
    try:
        subjects = execute_query('''
            SELECT s.*, t.name as teacher_name
            FROM subjects s
            JOIN classes c ON s.class_id = c.id
            JOIN teachers t ON s.teacher_code = t.code
            JOIN departments d ON c.department_id = d.id
            WHERE c.name = %s AND c.is_active = TRUE AND t.is_active = TRUE AND d.code = %s
            ORDER BY s.name
        ''', (class_name, dept_code.upper()), fetch=True)
        return jsonify(subjects)
    except Error as e:
        return jsonify(error=f"Database error: {str(e)}"), 500

@app.route('/api/get_teacher_subjects/<dept_code>/<teacher_code>', methods=['GET'])
def get_teacher_subjects(dept_code, teacher_code):
    """Get all subjects taught by a specific teacher in a department"""
    try:
        subjects = execute_query('''
            SELECT s.*, c.name as class_name
            FROM subjects s
            JOIN classes c ON s.class_id = c.id
            JOIN teachers t ON s.teacher_code = t.code
            JOIN departments d ON c.department_id = d.id AND t.department_id = d.id
            WHERE s.teacher_code = %s AND c.is_active = TRUE AND d.code = %s
            ORDER BY c.name, s.name
        ''', (teacher_code.upper(), dept_code.upper()), fetch=True)
        return jsonify(subjects)
    except Error as e:
        return jsonify(error=f"Database error: {str(e)}"), 500

@app.route('/api/validate_timetable_data/<dept_code>', methods=['GET'])
def validate_timetable_data(dept_code):
    """Validate if all required data is present for timetable generation for a department"""
    try:
        dept_code = dept_code.upper()
        department = execute_query(
            "SELECT id FROM departments WHERE code = %s", 
            (dept_code,), 
            fetch=True
        )
        
        if not department:
            return jsonify(error=f"Department {dept_code} not found"), 404
            
        dept_id = department[0]['id']
        
        validation_results = {
            "valid": True,
            "errors": [],
            "warnings": []
        }
        
        # Check classes
        classes = execute_query(
            "SELECT COUNT(*) as count FROM classes WHERE department_id = %s AND is_active = TRUE", 
            (dept_id,), fetch=True
        )
        if classes[0]['count'] == 0:
            validation_results["valid"] = False
            validation_results["errors"].append("No active classes found")
        
        # Check teachers
        teachers = execute_query(
            "SELECT COUNT(*) as count FROM teachers WHERE department_id = %s AND is_active = TRUE", 
            (dept_id,), fetch=True
        )
        if teachers[0]['count'] == 0:
            validation_results["valid"] = False
            validation_results["errors"].append("No active teachers found")
        
        # Check subjects
        subjects = execute_query("""
            SELECT COUNT(*) as count FROM subjects s
            JOIN classes c ON s.class_id = c.id
            JOIN teachers t ON s.teacher_code = t.code
            WHERE c.department_id = %s AND c.is_active = TRUE AND t.is_active = TRUE
        """, (dept_id,), fetch=True)
        if subjects[0]['count'] == 0:
            validation_results["valid"] = False
            validation_results["errors"].append("No subjects assigned to active classes with active teachers")
        
        # Check for classes without subjects
        classes_without_subjects = execute_query("""
            SELECT c.name FROM classes c
            LEFT JOIN subjects s ON c.id = s.class_id
            WHERE c.department_id = %s AND c.is_active = TRUE AND s.id IS NULL
        """, (dept_id,), fetch=True)
        for cls in classes_without_subjects:
            validation_results["warnings"].append(f"Class '{cls['name']}' has no subjects assigned")
        
        # Check for teachers without subjects
        teachers_without_subjects = execute_query("""
            SELECT t.name, t.code FROM teachers t
            LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id
            WHERE t.department_id = %s AND t.is_active = TRUE AND ts.id IS NULL
        """, (dept_id,), fetch=True)
        for teacher in teachers_without_subjects:
            validation_results["warnings"].append(f"Teacher '{teacher['name']} ({teacher['code']})' has no subjects defined")
        
        # Check constraints
        constraints = execute_query(
            "SELECT COUNT(*) as count FROM constraints WHERE department_id = %s", 
            (dept_id,), fetch=True
        )
        if constraints[0]['count'] == 0:
            validation_results["warnings"].append("No constraints defined, using default values")
        
        return jsonify(validation_results)
        
    except Error as e:
        return jsonify(error=f"Database error: {str(e)}"), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify(error="Endpoint not found"), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify(error="Internal server error"), 500

@app.errorhandler(400)
def bad_request(error):
    return jsonify(error="Bad request"), 400

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
