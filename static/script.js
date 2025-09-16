// Global variables
let allTeachers = [];
let allSubjects = [];
let classCounter = 1;
let savedClasses = [];
let departmentTimetables = [];
let currentDepartmentCode = '';

// Utility functions
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px;
        border-radius: 5px;
        color: white;
        z-index: 1000;
        max-width: 300px;
        ${type === 'error' ? 'background-color: #e74c3c;' : 
          type === 'success' ? 'background-color: #2ecc71;' : 
          'background-color: #3498db;'}
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 5000);
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function sanitizeInput(input) {
    return input.trim().replace(/[<>]/g, '');
}

// Navigation functions
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.form-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show target section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Update progress bar - mark all previous steps as completed
    const sections = ['department-section', 'teacher-section', 'class-section', 'constraints-section'];
    const currentIndex = sections.indexOf(sectionId);
    
    document.querySelectorAll('.progress-step').forEach((step, index) => {
        step.classList.remove('active');
        
        if (index < currentIndex) {
            step.classList.add('completed');
        } else if (index === currentIndex) {
            step.classList.add('active');
        } else {
            step.classList.remove('completed');
        }
    });
}

// Department functions
async function saveDepartment() {
    const deptName = document.getElementById('dept-name').value.trim();
    const deptCode = document.getElementById('dept-code').value.trim();
    
    if (!deptName || !deptCode) {
        showMessage('Please fill in all department fields', 'error');
        return false;
    }
    
    try {
        const response = await fetch('/api/save_department', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: sanitizeInput(deptName),
                code: sanitizeInput(deptCode).toUpperCase()
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to save department');
        }
        
        // Update global department code
        currentDepartmentCode = deptCode.toUpperCase();
        
        showMessage('Department saved successfully!', 'success');
        
        // Mark department section as completed
        document.querySelector('.progress-step[data-section="department-section"]')
            .classList.add('completed');
            
        return true;
    } catch (error) {
        console.error('Error saving department:', error);
        showMessage(`Error: ${error.message}`, 'error');
        return false;
    }
}

// 1. Update the checkDepartment function to clear previous data
async function checkDepartment() {
    const deptCode = document.getElementById('dept-code').value.trim().toUpperCase();
    if (!deptCode) {
        // Clear everything if no department code
        clearAllFormData();
        currentDepartmentCode = '';
        updateDepartmentStatus();
        return;
    }

    try {
        // Clear previous department data first
        clearAllFormData();
        
        const response = await fetch(`/api/check_department?code=${encodeURIComponent(deptCode)}`);
        if (!response.ok) {
            throw new Error('Failed to check department');
        }
        
        const result = await response.json();
        
        if (result.exists) {
            // Department exists - load its data
            document.getElementById('dept-name').value = result.department.name || '';
            document.getElementById('dept-code').value = result.department.code || '';
            
            // Update global department code
            currentDepartmentCode = deptCode;
            
            // Show message to user
            showMessage(`Department "${result.department.name}" found with ${result.department.teachers_count} teachers and ${result.department.classes_count} classes.`, 'info');
            
            // Load department-specific data
            await loadInitialData();
            
            // Load saved form data for this specific department
            loadSavedFormData();
            
            // Mark department section as completed
            document.querySelector('.progress-step[data-section="department-section"]')
                .classList.add('completed');
        } else {
            // New department - clear everything and set up fresh
            currentDepartmentCode = deptCode;
            allTeachers = [];
            allSubjects = [];
            
            // Reset to default forms
            resetToDefaultForms();
        }
        
        // Update department status regardless
        updateDepartmentStatus();
        
    } catch (error) {
        console.error('Error checking department:', error);
        // Clear data on error and reset
        clearAllFormData();
        currentDepartmentCode = deptCode; // Still set the code for new department
        updateDepartmentStatus();
    }
}

// 2. Add function to clear all form data
function clearAllFormData() {
    // Clear global variables
    allTeachers = [];
    allSubjects = [];
    savedClasses = [];
    departmentTimetables = [];
    
    // Clear teachers container
    const teachersContainer = document.getElementById('teachers-container');
    if (teachersContainer) {
        teachersContainer.innerHTML = '';
    }
    
    // Clear classes container
    const classesContainer = document.getElementById('classes-container');
    if (classesContainer) {
        classesContainer.innerHTML = '';
    }
    
    // Reset constraints to defaults
    const workingDays = document.getElementById('working-days');
    const periodsPerDay = document.getElementById('periods-per-day');
    const breakPeriods = document.getElementById('break-periods');
    const subjectGap = document.getElementById('subject-gap');
    
    if (workingDays) workingDays.value = '5';
    if (periodsPerDay) periodsPerDay.value = '6';
    if (breakPeriods) breakPeriods.value = '';
    if (subjectGap) subjectGap.value = '1';
    
    // Clear any existing results
    const resultsDiv = document.getElementById('timetable-results');
    if (resultsDiv) {
        resultsDiv.innerHTML = '';
    }
    
    // Reset progress indicators
    document.querySelectorAll('.progress-step').forEach(step => {
        step.classList.remove('completed');
    });
    
    console.log('Cleared all form data');
}

// 3. Add function to reset to default forms
function resetToDefaultForms() {
    // Add one default teacher form
    const teachersContainer = document.getElementById('teachers-container');
    if (teachersContainer && teachersContainer.children.length === 0) {
        addTeacherForm();
    }
    
    // Add one default class form
    const classesContainer = document.getElementById('classes-container');
    if (classesContainer && classesContainer.children.length === 0) {
        addClassForm();
    }
    
    console.log('Reset to default forms');
}

// 4. Update loadInitialData to be department-specific
async function loadInitialData() {
    const deptCode = currentDepartmentCode || document.getElementById('dept-code').value.trim().toUpperCase();
    
    if (!deptCode) {
        console.log('No department code, skipping data load');
        allTeachers = [];
        allSubjects = [];
        return;
    }
    
    try {
        console.log(`Loading data for department: ${deptCode}`);
        
        // Load teachers for this specific department
        await loadTeachers(deptCode);
        
        // Load subjects for this specific department
        await loadSubjects(deptCode);
        
        console.log(`Loaded ${allTeachers.length} teachers and ${allSubjects.length} subjects for ${deptCode}`);
        
    } catch (error) {
        console.error("Error loading initial data:", error);
        showMessage("Warning: Could not load some initial data", 'error');
        
        // Reset to empty arrays on error
        allTeachers = [];
        allSubjects = [];
    }
}

// 5. Update loadTeachers to clear data first
async function loadTeachers(deptCode) {
    // Clear previous teachers data
    allTeachers = [];
    
    if (!deptCode) {
        console.log('No department code provided for loading teachers');
        return;
    }
    
    try {
        console.log(`Fetching teachers for department: ${deptCode}`);
        const response = await fetch(`/api/get_teachers/${deptCode}`);
        
        if (response.ok) {
            const teachers = await response.json();
            allTeachers = teachers || [];
            console.log(`Loaded ${allTeachers.length} teachers for department ${deptCode}`);
        } else if (response.status === 404) {
            console.log(`No teachers found for department ${deptCode}`);
            allTeachers = [];
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        console.error("Error loading teachers:", error);
        allTeachers = [];
        throw error; // Re-throw to be handled by caller
    }
}

// 6. Update loadSubjects to clear data first
async function loadSubjects(deptCode) {
    // Clear previous subjects data
    allSubjects = [];
    
    if (!deptCode) {
        console.log('No department code provided for loading subjects');
        return;
    }
    
    try {
        console.log(`Fetching subjects for department: ${deptCode}`);
        const response = await fetch(`/api/get_subjects/${deptCode}`);
        
        if (response.ok) {
            const subjects = await response.json();
            allSubjects = subjects || [];
            console.log(`Loaded ${allSubjects.length} subjects for department ${deptCode}`);
        } else if (response.status === 404) {
            console.log(`No subjects found for department ${deptCode}`);
            allSubjects = [];
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        console.error("Error loading subjects:", error);
        allSubjects = [];
        throw error; // Re-throw to be handled by caller
    }
}

// 7. Update loadSavedFormData to be more department-specific
async function loadSavedFormData() {
    const deptCode = currentDepartmentCode || document.getElementById('dept-code').value.trim().toUpperCase();
    
    if (!deptCode) {
        console.log('No department code, skipping saved form data load');
        return;
    }
    
    try {
        const savedData = localStorage.getItem(`timetable_form_data_${deptCode}`);
        if (!savedData) {
            console.log(`No saved form data found for department ${deptCode}`);
            return;
        }
        
        console.log(`Loading saved form data for department ${deptCode}`);
        const data = JSON.parse(savedData);
        
        // Verify this data is for the correct department
        if (data.department && data.department.code !== deptCode) {
            console.warn(`Saved data department code (${data.department.code}) doesn't match current (${deptCode}), skipping load`);
            return;
        }
        
        // Load department data
        if (data.department) {
            const deptName = document.getElementById('dept-name');
            const deptCodeInput = document.getElementById('dept-code');
            if (deptName && !deptName.value) deptName.value = data.department.name || '';
            if (deptCodeInput && !deptCodeInput.value) deptCodeInput.value = data.department.code || '';
        }
        
        // Load teachers data (only if containers are empty)
        if (data.teachers && data.teachers.length > 0) {
            const container = document.getElementById('teachers-container');
            if (container && container.children.length === 0) {
                data.teachers.forEach(teacher => {
                    addTeacherForm();
                    const lastForm = container.lastElementChild;
                    
                    if (lastForm) {
                        lastForm.querySelector('.teacher-name').value = teacher.name || '';
                        lastForm.querySelector('.teacher-code').value = teacher.code || '';
                        lastForm.querySelector('.working-hours').value = teacher.working_hours || 20;
                        lastForm.querySelector('.max-consecutive').value = teacher.max_consecutive || 3;
                        lastForm.querySelector('.min-free-periods').value = teacher.min_free_periods || 2;
                        
                        // Add subjects
                        const subjectContainer = lastForm.querySelector('.subjects-input-container');
                        subjectContainer.innerHTML = '';
                        
                        if (teacher.subjects && teacher.subjects.length > 0) {
                            teacher.subjects.forEach(subject => {
                                const div = document.createElement('div');
                                div.className = 'subject-input-group';
                                div.innerHTML = `
                                    <input type="text" class="subject-input" placeholder="Subject name" required value="${subject || ''}">
                                    <button type="button" class="remove-subject-btn" onclick="removeSubjectInput(this)">×</button>
                                `;
                                subjectContainer.appendChild(div);
                            });
                        } else {
                            // Add at least one empty input
                            const div = document.createElement('div');
                            div.className = 'subject-input-group';
                            div.innerHTML = `
                                <input type="text" class="subject-input" placeholder="Subject name" required>
                                <button type="button" class="remove-subject-btn" onclick="removeSubjectInput(this)">×</button>
                            `;
                            subjectContainer.appendChild(div);
                        }
                    }
                });
            }
        }
        
        // Load classes data (only if containers are empty)
        if (data.classes && data.classes.length > 0) {
            const container = document.getElementById('classes-container');
            if (container && container.children.length === 0) {
                // Use Promise.all to handle async operations
                const classPromises = data.classes.map(async (cls) => {
                    addClassForm();
                    const lastForm = container.lastElementChild;
                    
                    if (lastForm) {
                        lastForm.querySelector('.class-name').value = cls.name || '';
                        lastForm.querySelector('.class-year').value = cls.year || '';
                        lastForm.querySelector('.class-division').value = cls.division || '';
                        lastForm.querySelector('.class-shift').value = cls.shift || 'Morning';
                        
                        // Load subjects for this class
                        if (cls.subjects && cls.subjects.length > 0) {
                            const classId = lastClassForm.dataset.classId;
                            
                            for (const subject of cls.subjects) {
                                await addSubjectFormWithData(classId, subject);  // This line
                            }
                        }
                    }
                });
                
                // Wait for all class operations to complete
                await Promise.all(classPromises);
            }
        }
        
        // Load constraints data
        if (data.constraints) {
            const workingDays = document.getElementById('working-days');
            const periodsPerDay = document.getElementById('periods-per-day');
            const breakPeriods = document.getElementById('break-periods');
            const subjectGap = document.getElementById('subject-gap');
            
            if (workingDays) workingDays.value = data.constraints.working_days || 5;
            if (periodsPerDay) periodsPerDay.value = data.constraints.periods_per_day || 6;
            if (breakPeriods) breakPeriods.value = data.constraints.break_periods || '';
            if (subjectGap) subjectGap.value = data.constraints.subject_gap || 1;
        }
        
        console.log(`Successfully loaded saved form data for department ${deptCode}`);
    } catch (error) {
        console.error("Error loading saved form data:", error);
    }
}

// 8. Update the department code input event listener
document.addEventListener('DOMContentLoaded', function() {
    const deptCodeInput = document.getElementById('dept-code');
    
    if (deptCodeInput) {
        // Remove existing listeners to avoid duplicates
        deptCodeInput.removeEventListener('blur', checkDepartment);
        deptCodeInput.removeEventListener('input', handleDepartmentInput);
        
        // Add new listeners
        deptCodeInput.addEventListener('blur', checkDepartment);
        deptCodeInput.addEventListener('input', handleDepartmentInput);
    }
});

// 9. Add new input handler for department code
function handleDepartmentInput() {
    const deptCode = document.getElementById('dept-code').value.trim().toUpperCase();
    
    // Update the global variable immediately
    if (currentDepartmentCode !== deptCode) {
        console.log(`Department code changed from ${currentDepartmentCode} to ${deptCode}`);
        currentDepartmentCode = deptCode;
        
        // Clear data when department changes
        if (deptCode) {
            // Don't clear immediately on input, wait for blur/check
            updateDepartmentStatus();
        } else {
            // Clear everything if department code is empty
            clearAllFormData();
            currentDepartmentCode = '';
            updateDepartmentStatus();
        }
    }
}

// Update department status display to include overview link
function updateDepartmentStatus() {
    const deptCode = document.getElementById('dept-code').value.trim().toUpperCase();
    const deptName = document.getElementById('dept-name').value.trim();
    const deptStatus = document.getElementById('dept-status');
    
    if (deptCode) {
        // Check if we have existing timetables for this department
        const existingTimetables = JSON.parse(localStorage.getItem(`timetables_${deptCode}`) || '[]');
        
        if (existingTimetables.length > 0) {
            deptStatus.innerHTML = `
                <div class="dept-status-with-overview">
                    <div>
                        <span class="status-indicator status-exists"></span>
                        <span>Department has ${existingTimetables.length} saved timetable(s)</span>
                    </div>
                    <button class="view-timetables-btn" onclick="loadDepartmentTimetables()">
                        View Timetables
                    </button>
                </div>
            `;
        } else {
            deptStatus.innerHTML = `
                <div class="dept-status-with-overview">
                    <div>
                        <span class="status-indicator status-new"></span>
                        <span>New department - no timetables yet</span>
                    </div>
                </div>
            `;
        }
    } else {
        deptStatus.innerHTML = '';
    }
}

// Fetch timetables for the current department
async function loadDepartmentTimetables() {
    const deptCode = document.getElementById('dept-code').value.trim().toUpperCase();
    
    if (!deptCode) {
        showMessage('Please enter a department code first', 'error');
        return;
    }

    // Show the overview section
    showSection('department-overview-section');
    
    try {
        // Show loading state
        document.getElementById('overview-loading').style.display = 'block';
        document.getElementById('timetable-list').style.display = 'none';
        document.getElementById('no-timetables-message').style.display = 'none';
        
        // Get timetables from localStorage (later this should come from database)
        const savedTimetables = JSON.parse(localStorage.getItem(`timetables_${deptCode}`) || '[]');
        departmentTimetables = savedTimetables;
        
        // Simulate loading delay for better UX
        setTimeout(() => {
            displayTimetableList();
        }, 500);
        
    } catch (error) {
        console.error('Error loading timetables:', error);
        showNoTimetablesMessage();
    }
}
async function deleteAllDepartmentData(deptCode) {
    if (!deptCode) {
        showMessage('No department code found', 'error');
        return;
    }
    
    const finalConfirm = confirm(
        `⚠️ WARNING: This will permanently delete ALL data for department ${deptCode}:\n\n` +
        '• All teachers and their subjects\n' +
        '• All classes and their subjects\n' +
        '• All constraints\n' +
        '• All generated timetables\n' +
        '• All saved form data\n\n' +
        'This action cannot be undone. Are you absolutely sure?'
    );
    
    if (!finalConfirm) {
        return;
    }
    
    try {
        showMessage('Deleting department data...', 'info');
        
        // 1. Clear localStorage data
        localStorage.removeItem(`timetable_form_data_${deptCode}`);
        localStorage.removeItem(`timetables_${deptCode}`);
        
        // 2. Delete database data (teachers, classes, subjects, constraints)
        const deletePromises = [
            // Delete teachers for this department
            fetch(`/api/delete_teachers/${deptCode}`, { method: 'DELETE' }),
            // Delete classes for this department  
            fetch(`/api/delete_classes/${deptCode}`, { method: 'DELETE' }),
            // Delete constraints for this department
            fetch(`/api/delete_constraints/${deptCode}`, { method: 'DELETE' })
        ];
        
        // Wait for all deletions to complete
        const results = await Promise.allSettled(deletePromises);
        
        // Check for any failures (but don't stop the process)
        const failures = results.filter(result => result.status === 'rejected');
        if (failures.length > 0) {
            console.warn('Some database deletions failed:', failures);
            showMessage('Some data may not have been deleted from the database. Please check manually.', 'error');
        }
        
        // 3. Clear global variables
        allTeachers = [];
        allSubjects = [];
        savedClasses = [];
        departmentTimetables = [];
        
        // 4. Clear form data
        clearAllFormData();
        
        // 5. Reset the department input
        document.getElementById('dept-name').value = '';
        document.getElementById('dept-code').value = '';
        currentDepartmentCode = '';
        
        // 6. Update UI
        updateDepartmentStatus();
        
        // 7. Go back to department section
        showSection('department-section');
        
        showMessage(`All data for department ${deptCode} has been deleted successfully!`, 'success');
        
        // 8. Optionally reload the page after a delay
        setTimeout(() => {
            if (confirm('Department data deleted. Would you like to reload the page to start fresh?')) {
                location.reload();
            }
        }, 2000);
        
    } catch (error) {
        console.error('Error deleting department data:', error);
        showMessage(`Error deleting department data: ${error.message}`, 'error');
    }
}

// Helper function to add a "Delete All Department Data" button to the overview
function addDeleteAllButton() {
    const deptCode = document.getElementById('dept-code').value.trim().toUpperCase();
    const overviewSection = document.getElementById('department-overview-section');
    
    if (!overviewSection || !deptCode) return;
    
    // Check if button already exists
    if (overviewSection.querySelector('.delete-all-dept-btn')) return;
    
    // Create delete all button
    const deleteAllBtn = document.createElement('button');
    deleteAllBtn.className = 'btn-danger delete-all-dept-btn';
    deleteAllBtn.textContent = `Delete All ${deptCode} Data`;
    deleteAllBtn.style.marginTop = '20px';
    deleteAllBtn.onclick = () => deleteAllDepartmentData(deptCode);
    
    // Add to overview section
    const timetableList = document.getElementById('timetable-list');
    if (timetableList && timetableList.parentNode) {
        timetableList.parentNode.appendChild(deleteAllBtn);
    }
}

// Display the list of timetables
function displayTimetableList() {
    const timetableList = document.getElementById('timetable-list');
    const loadingElement = document.getElementById('overview-loading');
    const noTimetablesElement = document.getElementById('no-timetables-message');
    
    // Hide loading
    loadingElement.style.display = 'none';
    
    if (departmentTimetables.length === 0) {
        noTimetablesElement.style.display = 'block';
        timetableList.style.display = 'none';
        // Still show delete all button even if no timetables
        addDeleteAllButton();
        return;
    }
    
    // Show list
    noTimetablesElement.style.display = 'none';
    timetableList.style.display = 'grid';
    
    // Clear previous list
    timetableList.innerHTML = '';
    
    // Add each timetable to the list
    departmentTimetables.forEach((timetable, index) => {
        const card = document.createElement('div');
        card.className = 'timetable-card';
        card.innerHTML = `
            <div class="timetable-header">
                <h3 class="timetable-title">${timetable.name || `Timetable ${index + 1}`}</h3>
                <span class="timetable-date">${formatDate(timetable.createdAt)}</span>
            </div>
            
            <div class="timetable-meta">
                <div class="meta-item">
                    <span class="meta-label">Classes:</span>
                    <span class="meta-value">${timetable.classes || 'N/A'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Teachers:</span>
                    <span class="meta-value">${timetable.teachers || 'N/A'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Working Days:</span>
                    <span class="meta-value">${timetable.workingDays || 'N/A'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Periods/Day:</span>
                    <span class="meta-value">${timetable.periodsPerDay || 'N/A'}</span>
                </div>
            </div>
            
            <div class="timetable-actions">
                <button class="btn view-btn" onclick="viewTimetable(${index})">View</button>
                <button class="btn edit-btn" onclick="editTimetable(${index})">Edit</button>
                <button class="btn-danger delete-btn" onclick="deleteTimetable(${index})">Delete</button>
            </div>
        `;
        timetableList.appendChild(card);
    });
    
    // Add the delete all button
    addDeleteAllButton();
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    try {
        return new Date(dateString).toLocaleDateString();
    } catch {
        return 'Unknown';
    }
}

// Show message when no timetables are found
function showNoTimetablesMessage() {
    document.getElementById('overview-loading').style.display = 'none';
    document.getElementById('timetable-list').style.display = 'none';
    document.getElementById('no-timetables-message').style.display = 'block';
}

// View a specific timetable
// In script.js, replace the viewTimetable function
function viewTimetable(index) {
    const timetable = departmentTimetables[index];
    
    // Convert timetable data to a URL-safe string
    const timetableData = encodeURIComponent(JSON.stringify(timetable.data));
    const timetableName = encodeURIComponent(timetable.name || `Timetable ${index + 1}`);
    
    // Open timetable view with data as URL parameter
    window.open(`/timetable?data=${timetableData}&name=${timetableName}&view=true`, '_blank');
}

// Edit a specific timetable - load its data into the form
function editTimetable(index) {
    const timetable = departmentTimetables[index];
    
    if (!timetable.formData) {
        showMessage('This timetable does not contain editable form data. Please create a new timetable.', 'error');
        return;
    }
    
    // Store the timetable data for editing
    sessionStorage.setItem('editTimetableData', JSON.stringify(timetable));
    
    // Show loading message
    showMessage('Loading timetable data for editing...', 'info');
    
    // Load the data into the form
    setTimeout(() => {
        loadTimetableDataIntoForm(timetable);
        showSection('teacher-section');
    }, 500);
}

// Load timetable data into the form for editing
async function loadTimetableDataIntoForm(timetable) {
    try {
        if (!timetable.formData) {
            showMessage('No form data available for this timetable', 'error');
            return;
        }
        
        const formData = timetable.formData;
        
        // Load department data
        if (formData.department) {
            const deptName = document.getElementById('dept-name');
            const deptCodeInput = document.getElementById('dept-code');
            if (deptName) deptName.value = formData.department.name || '';
            if (deptCodeInput) deptCodeInput.value = formData.department.code || '';
            currentDepartmentCode = formData.department.code || '';
        }
        
        // Load teacher data
        if (formData.teachers && formData.teachers.length > 0) {
            const teachersContainer = document.getElementById('teachers-container');
            teachersContainer.innerHTML = ''; // Clear existing forms
            
            for (const teacher of formData.teachers) {
                addTeacherForm(); // Add a new teacher form
                const lastTeacherForm = teachersContainer.lastElementChild;
                
                if (lastTeacherForm) {
                    // Fill teacher details
                    lastTeacherForm.querySelector('.teacher-name').value = teacher.name || '';
                    lastTeacherForm.querySelector('.teacher-code').value = teacher.code || '';
                    lastTeacherForm.querySelector('.working-hours').value = teacher.working_hours || 20;
                    lastTeacherForm.querySelector('.max-consecutive').value = teacher.max_consecutive || 3;
                    lastTeacherForm.querySelector('.min-free-periods').value = teacher.min_free_periods || 2;
                    
                    // Fill subjects
                    const subjectsContainer = lastTeacherForm.querySelector('.subjects-input-container');
                    subjectsContainer.innerHTML = ''; // Clear default subject input
                    
                    if (teacher.subjects && teacher.subjects.length > 0) {
                        teacher.subjects.forEach(subject => {
                            const subjectDiv = document.createElement('div');
                            subjectDiv.className = 'subject-input-group';
                            subjectDiv.innerHTML = `
                                <input type="text" class="subject-input" placeholder="Subject name" required value="${subject}">
                                <button type="button" class="remove-subject-btn" onclick="removeSubjectInput(this)">×</button>
                            `;
                            subjectsContainer.appendChild(subjectDiv);
                        });
                    } else {
                        // Add at least one empty subject input
                        const subjectDiv = document.createElement('div');
                        subjectDiv.className = 'subject-input-group';
                        subjectDiv.innerHTML = `
                            <input type="text" class="subject-input" placeholder="Subject name" required>
                            <button type="button" class="remove-subject-btn" onclick="removeSubjectInput(this)">×</button>
                        `;
                        subjectsContainer.appendChild(subjectDiv);
                    }
                }
            }
        }
        
        // Load class data
        if (formData.classes && formData.classes.length > 0) {
            const classesContainer = document.getElementById('classes-container');
            classesContainer.innerHTML = ''; // Clear existing forms
            
            for (const cls of formData.classes) {
                addClassForm(); // Add a new class form
                const lastClassForm = classesContainer.lastElementChild;
                
                if (lastClassForm) {
                    // Fill class details
                    lastClassForm.querySelector('.class-name').value = cls.name || '';
                    lastClassForm.querySelector('.class-year').value = cls.year || '';
                    lastClassForm.querySelector('.class-division').value = cls.division || '';
                    lastClassForm.querySelector('.class-shift').value = cls.shift || 'Morning';
                    
                    // Load subjects for this class
                    if (cls.subjects && cls.subjects.length > 0) {
                        const classId = lastClassForm.dataset.classId;
                        const subjectsContainer = lastClassForm.querySelector(`#subjects-container-${classId}`);
                        
                        for (const subject of cls.subjects) {
                            await addSubjectFormWithData(classId, subject);
                        }
                    }
                }
            }
        }
        
        // Load constraints data
        if (formData.constraints) {
            const workingDays = document.getElementById('working-days');
            const periodsPerDay = document.getElementById('periods-per-day');
            const breakPeriods = document.getElementById('break-periods');
            const subjectGap = document.getElementById('subject-gap');
            
            if (workingDays) workingDays.value = formData.constraints.working_days || 5;
            if (periodsPerDay) periodsPerDay.value = formData.constraints.periods_per_day || 6;
            if (breakPeriods) breakPeriods.value = formData.constraints.break_periods || '';
            if (subjectGap) subjectGap.value = formData.constraints.subject_gap || 1;
        }
        
        showMessage('Timetable data loaded successfully for editing!', 'success');
        
        // Mark department section as completed
        document.querySelector('.progress-step[data-section="department-section"]')?.classList.add('completed');
            
    } catch (error) {
        console.error('Error loading timetable data:', error);
        showMessage('Error loading timetable data: ' + error.message, 'error');
    }
}

async function deleteTimetable(index) {
    const timetable = departmentTimetables[index];
    const deptCode = document.getElementById('dept-code').value.trim().toUpperCase();
    
    // Check if this is the last timetable - offer to delete all department data
    if (departmentTimetables.length === 1) {
        const deleteAll = confirm(
            'This is the last timetable for this department. Would you like to delete ALL department data (teachers, classes, subjects, constraints) as well?\n\n' +
            'Click OK to delete everything, or Cancel to delete only this timetable.'
        );
        
        if (deleteAll) {
            return await deleteAllDepartmentData(deptCode);
        }
    }
    
    // Standard timetable deletion
    if (!confirm('Are you sure you want to delete this timetable? This action cannot be undone.')) {
        return;
    }
    
    try {
        // Remove from array
        departmentTimetables.splice(index, 1);
        
        // Update storage
        localStorage.setItem(`timetables_${deptCode}`, JSON.stringify(departmentTimetables));
        
        // Refresh the list
        displayTimetableList();
        showMessage('Timetable deleted successfully', 'success');
        
        // Update department status
        updateDepartmentStatus();
        
    } catch (error) {
        console.error('Error deleting timetable:', error);
        showMessage('Error deleting timetable', 'error');
    }
}

// Save timetable data to history
function saveTimetableToHistory(timetableData) {
    try {
        const deptCode = currentDepartmentCode || document.getElementById('dept-code').value.trim().toUpperCase();
        const deptName = document.getElementById('dept-name').value.trim();
        
        if (!deptCode) {
            console.warn('No department code found, skipping save to history');
            return;
        }
        
        // Get existing timetables or initialize empty array
        const existingTimetables = JSON.parse(localStorage.getItem(`timetables_${deptCode}`) || '[]');
        
        // Count classes and teachers from the timetable data
        const classCount = Object.keys(timetableData).filter(key => 
            !key.includes('(') || !key.includes(')')).length;
        
        const teacherCount = Object.keys(timetableData).filter(key => 
            key.includes('(') && key.includes(')')).length;
        
        // Get constraints
        const workingDays = parseInt(document.getElementById('working-days').value) || 5;
        const periodsPerDay = parseInt(document.getElementById('periods-per-day').value) || 6;
        
        // Capture the current form data
        const formData = {
            department: {
                name: deptName,
                code: deptCode
            },
            teachers: Array.from(document.querySelectorAll('.teacher-form')).map(form => ({
                name: form.querySelector('.teacher-name')?.value || '',
                code: form.querySelector('.teacher-code')?.value || '',
                subjects: Array.from(form.querySelectorAll('.subject-input')).map(input => input.value.trim()).filter(s => s),
                working_hours: parseInt(form.querySelector('.working-hours')?.value) || 20,
                max_consecutive: parseInt(form.querySelector('.max-consecutive')?.value) || 3,
                min_free_periods: parseInt(form.querySelector('.min-free-periods')?.value) || 2
            })),
            classes: Array.from(document.querySelectorAll('.class-form')).map(form => ({
                name: form.querySelector('.class-name')?.value || '',
                year: form.querySelector('.class-year')?.value || '',
                division: form.querySelector('.class-division')?.value || '',
                shift: form.querySelector('.class-shift')?.value || 'Morning',
                subjects: Array.from(form.querySelectorAll('.subject-form')).map(subjectForm => ({
                    name: subjectForm.querySelector('.subject-name')?.value || '',
                    teacher_code: subjectForm.querySelector('.teacher-code')?.value || '',
                    hours_per_week: parseInt(subjectForm.querySelector('.hours-per-week')?.value) || 4,
                    subject_type: subjectForm.querySelector('.subject-type')?.value || 'theory',
                    fixed_period: subjectForm.querySelector('.fixed-period')?.value || '',
                    is_combined: subjectForm.querySelector('.combined-class')?.checked || false
                }))
            })),
            constraints: {
                working_days: workingDays,
                periods_per_day: periodsPerDay,
                break_periods: document.getElementById('break-periods')?.value || '',
                subject_gap: parseInt(document.getElementById('subject-gap')?.value) || 1
            }
        };
        
        // Create new timetable entry with both timetable data AND form data
        const newTimetable = {
            name: `${deptName} Timetable ${new Date().toLocaleDateString()}`,
            department: {
                name: deptName,
                code: deptCode
            },
            data: timetableData,
            formData: formData,
            createdAt: new Date().toISOString(),
            classes: classCount,
            teachers: teacherCount,
            workingDays: workingDays,
            periodsPerDay: periodsPerDay
        };
        
        // Add to beginning of array (most recent first)
        existingTimetables.unshift(newTimetable);
        
        // Keep only last 10 timetables
        const recentTimetables = existingTimetables.slice(0, 10);
        localStorage.setItem(`timetables_${deptCode}`, JSON.stringify(recentTimetables));
        
        console.log('Timetable saved to history with form data');
        
        // Update the department status to reflect new timetable
        updateDepartmentStatus();
        
    } catch (error) {
        console.error('Error saving timetable to history:', error);
    }
}

// Teacher form management
function addTeacherForm() {
    const container = document.getElementById('teachers-container');
    const teacherForm = document.createElement('div');
    teacherForm.className = 'teacher-form';
    teacherForm.innerHTML = `
        <div class="teacher-header">
            <h3>Teacher ${container.children.length + 1}</h3>
        </div>
        <div class="form-group">
            <label>Teacher Name:</label>
            <input type="text" class="teacher-name" required>
        </div>
        <div class="form-group">
            <label>Teacher Code:</label>
            <input type="text" class="teacher-code" required>
        </div>
        <div class="form-group">
            <label>Subjects:</label>
            <div class="subjects-input-container">
                <div class="subject-input-group">
                    <input type="text" class="subject-input" placeholder="Subject name" required>
                    <button type="button" class="remove-subject-btn" onclick="this.closest('.subject-input-group').remove()">×</button>
                </div>
            </div>
            <button type="button" class="add-subject-btn" onclick="addSubjectToTeacher(this.closest('.teacher-form'))">+ Add Subject</button>
        </div>
        <div class="form-group">
            <label>Max Working Hours/Week:</label>
            <input type="number" class="working-hours" min="1" value="20">
        </div>
        <div class="form-group">
            <label>Max Consecutive Periods:</label>
            <input type="number" class="max-consecutive" min="1" value="3">
        </div>
        <div class="form-group">
            <label>Minimum Free Periods per Day:</label>
            <input type="number" class="min-free-periods" min="1" max="6" value="2">
        </div>
        <button type="button" class="btn-remove" onclick="this.closest('.teacher-form').remove()">Remove Teacher</button>
    `;
    container.appendChild(teacherForm);
}

function removeTeacherForm(button) {
    if (confirm('Are you sure you want to remove this teacher?')) {
        button.closest('.teacher-form').remove();
        updateTeacherHeaders();
    }
}

function updateTeacherHeaders() {
    const teacherForms = document.querySelectorAll('.teacher-form');
    teacherForms.forEach((form, index) => {
        const header = form.querySelector('.teacher-header h3');
        if (header) {
            header.textContent = `Teacher ${index + 1}`;
        }
    });
}

function addSubjectToTeacher(teacherForm) {
    const container = teacherForm.querySelector('.subjects-input-container');
    const div = document.createElement('div');
    div.className = 'subject-input-group';
    div.innerHTML = `
        <input type="text" class="subject-input" placeholder="Subject name" required maxlength="50">
        <button type="button" class="remove-subject-btn" onclick="removeSubjectInput(this)">×</button>
    `;
    container.appendChild(div);
    div.querySelector('.subject-input').focus();
}

function removeSubjectInput(button) {
    const container = button.closest('.subjects-input-container');
    if (container.children.length > 1) {
        button.closest('.subject-input-group').remove();
    } else {
        showMessage('At least one subject is required', 'error');
    }
}

async function saveTeachers() {
    const teacherForms = document.querySelectorAll('.teacher-form');
    const teachers = [];
    let hasErrors = false;

    // Validate department code
    const deptCode = currentDepartmentCode || document.getElementById('dept-code').value.trim().toUpperCase();
    if (!deptCode) {
        showMessage('Please enter and save department details first', 'error');
        return;
    }

        // First, ensure the department exists
    try {
        const deptCheckResponse = await fetch(`/api/check_department?code=${encodeURIComponent(deptCode)}`);
        const deptCheckResult = await deptCheckResponse.json();
        
        if (!deptCheckResult.exists) {
            // Department doesn't exist, so save it first
            const deptSaved = await saveDepartment();
            if (!deptSaved) {
                showMessage('Failed to save department. Cannot proceed with teachers.', 'error');
                return;
            }
        }
    } catch (error) {
        console.error('Error checking department:', error);
        showMessage('Error verifying department. Please try again.', 'error');
        return;
    }

    teacherForms.forEach(form => {
        const name = form.querySelector('.teacher-name').value.trim();
        const code = form.querySelector('.teacher-code').value.trim();
        const workingHours = parseInt(form.querySelector('.working-hours').value);
        const maxConsecutive = parseInt(form.querySelector('.max-consecutive').value);
        const minFreePeriods = parseInt(form.querySelector('.min-free-periods').value);
        
        const subjectInputs = form.querySelectorAll('.subject-input');
        const subjects = Array.from(subjectInputs)
            .map(input => input.value.trim())
            .filter(subject => subject);

        if (!name || !code || subjects.length === 0) {
            showMessage('Please fill all teacher details including at least one subject', 'error');
            hasErrors = true;
            return;
        }

        teachers.push({
            name: name,
            code: code.toUpperCase(),
            subjects: subjects,
            working_hours: workingHours,
            max_consecutive: maxConsecutive,
            min_free_periods: minFreePeriods,
            department_code: deptCode // Include department code
        });
    });

    if (hasErrors || teachers.length === 0) {
        return;
    }

    // Save each teacher
    try {
        const results = await Promise.all(teachers.map(teacher => 
            fetch('/api/save_teacher', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(teacher)
            }).then(response => response.json())
        ));
        
        const hasError = results.some(result => result.error);
        if (hasError) {
            const errors = results.filter(r => r.error).map(r => r.error);
            showMessage('Errors: ' + errors.join(', '), 'error');
        } else {
            showMessage('Teachers saved successfully!', 'success');
            // Reload teachers data for this department
            await loadTeachers(deptCode);

            //Mark teacher section as completed
            document.querySelector('.progress-step[data-section="teacher-section"]').classList.add('completed');
            showSection('class-section');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Error saving teachers', 'error');
    }
}

// Class management
function addClassForm() {
    const container = document.getElementById('classes-container');
    const classId = 'class-' + (++classCounter); 
    
    const classForm = document.createElement('div');
    classForm.className = 'class-form';
    classForm.dataset.classId = classId;
    classForm.innerHTML = `
        <div class="class-header">
            <h3>Class ${container.children.length + 1}</h3>
        </div>
        <div class="form-group">
            <label>Class Name: <span class="required">*</span></label>
            <input type="text" class="class-name" required maxlength="50" placeholder="e.g., CSE-A, ECE-B">
        </div>
        <div class="form-group">
            <label>Year: <span class="required">*</span></label>
            <select class="class-year" required>
                <option value="">Select Year</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
            </select>
        </div>
        <div class="form-group">
            <label>Section/Division/Shift:</label>
            <input type="text" class="class-division" placeholder="A, B, C, etc." maxlength="10">
        </div>
        <div class="form-group">
            <label>Shift: <span class="required">*</span></label>
            <select class="class-shift" required>
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
            </select>
        </div>
        
        <h4>Subjects for this Class</h4>
        <div class="subjects-container" id="subjects-container-${classId}"></div>
        <button type="button" class="add-subject-btn" data-class-id="${classId}">+ Add Subject</button>
        <button type="button" class="btn-remove remove-class-btn">Remove Class</button>
        <hr>
    `;
    
    container.appendChild(classForm);
    
    // Add event listeners
    classForm.querySelector('.add-subject-btn').addEventListener('click', function() {
        addSubjectForm(classId);
    });
    
    classForm.querySelector('.remove-class-btn').addEventListener('click', function() {
        removeClassForm(classForm);
    });
    
    // Focus on class name
    classForm.querySelector('.class-name').focus();
}

function removeClassForm(classForm) {
    if (confirm('Are you sure you want to remove this class and all its subjects?')) {
        classForm.remove();
        updateClassHeaders();
    }
}

function updateClassHeaders() {
    const classForms = document.querySelectorAll('.class-form');
    classForms.forEach((form, index) => {
        const header = form.querySelector('.class-header h3');
        if (header) {
            header.textContent = `Class ${index + 1}`;
        }
    });
}

async function addSubjectForm(classId) {
    const container = document.querySelector(`#subjects-container-${classId}`);
    const deptCode = currentDepartmentCode || document.getElementById('dept-code').value.trim().toUpperCase();
    
    if (!deptCode) {
        showMessage('Please enter department details first', 'error');
        return;
    }
    
    try {
        // Get subjects with teachers from server for this department
        const response = await fetch(`/api/get_subjects_with_teachers/${deptCode}`);
        if (!response.ok) {
            throw new Error('Failed to load subjects');
        }
        
        const subjectsWithTeachers = await response.json();
        
        const subjectForm = document.createElement('div');
        subjectForm.className = 'subject-form';
        subjectForm.innerHTML = `
            <div class="subject-form-header">
                <h5>Subject ${container.children.length + 1}</h5>
            </div>
            <div class="form-group">
                <label>Subject Name: <span class="required">*</span></label>
                <select class="subject-name" required>
                    <option value="">Select Subject</option>
                    ${Object.keys(subjectsWithTeachers).sort().map(subject => 
                        `<option value="${subject}">${subject}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Teacher: <span class="required">*</span></label>
                <select class="teacher-code" required>
                    <option value="">Select Teacher</option>
                </select>
            </div>
            <div class="form-group">
                <label>Hours per Week:</label>
                <input type="number" class="hours-per-week" min="1" max="20" value="4" placeholder="4">
            </div>
            <div class="form-group">
                <label>Subject Type:</label>
                <select class="subject-type">
                    <option value="theory">Theory</option>
                    <option value="practical">Practical/Lab</option>
                    <option value="tutorial">Tutorial</option>
                </select>
            </div>
            <div class="form-group">
                <label>Fixed Period (optional):</label>
                <select class="fixed-period">
                    <option value="">No fixed period</option>
                    <option value="1">Period 1</option>
                    <option value="2">Period 2</option>
                    <option value="3">Period 3</option>
                    <option value="4">Period 4</option>
                    <option value="5">Period 5</option>
                    <option value="6">Period 6</option>
                    <option value="7">Period 7</option>
                    <option value="8">Period 8</option>
                </select>
            </div>
            <div class="form-group combined-class-checkbox">
                <label>
                    <input type="checkbox" class="combined-class"> Combined Class (multiple classes together)
                </label>
            </div>
            <button type="button" class="btn-remove remove-subject-btn">Remove Subject</button>
        `;
        
        container.appendChild(subjectForm);

        // Set up event handlers
        const subjectSelect = subjectForm.querySelector('.subject-name');
        const teacherSelect = subjectForm.querySelector('.teacher-code');
        
        // Handle subject selection 
        subjectSelect.addEventListener('change', function() {
            const selectedSubject = this.value;
            teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
            
            if (selectedSubject && subjectsWithTeachers[selectedSubject]) {
                subjectsWithTeachers[selectedSubject].forEach(teacher => {
                    const option = document.createElement('option');
                    option.value = teacher.code;
                    option.textContent = `${teacher.name} (${teacher.code})`;
                    teacherSelect.appendChild(option);
                });
            }
        });

        // Remove subject handler
        subjectForm.querySelector('.remove-subject-btn').addEventListener('click', function() {
            if (container.children.length > 1) {
                subjectForm.remove();
                updateSubjectHeaders(container);
            } else {
                showMessage('At least one subject is required for each class', 'error');
            }
        });
        
    } catch (error) {
        console.error("Error adding subject form:", error);
        showMessage("Error loading subjects. Please try again.", 'error');
    }
}

function updateSubjectHeaders(container) {
    const subjectForms = container.querySelectorAll('.subject-form');
    subjectForms.forEach((form, index) => {
        const header = form.querySelector('.subject-form-header h5');
        if (header) {
            header.textContent = `Subject ${index + 1}`;
        }
    });
}

async function saveClass() {
    const classForms = document.querySelectorAll('.class-form');
    const deptCode = currentDepartmentCode || document.getElementById('dept-code').value.trim().toUpperCase();
    
    if (!deptCode) {
        showMessage('Please enter and save department details first', 'error');
        return;
    }
    
    if (classForms.length === 0) {
        showMessage('Please add at least one class', 'error');
        return;
    }
    
    const classNames = new Set();
    let validationErrors = [];
    
    // Validate all classes first
    for (const [index, classForm] of Array.from(classForms).entries()) {
        const className = classForm.querySelector('.class-name')?.value?.trim() || '';
        const classYear = classForm.querySelector('.class-year')?.value;
        const classDivision = classForm.querySelector('.class-division')?.value?.trim() || null;
        const classShift = classForm.querySelector('.class-shift')?.value || 'Morning';

        if (!className) {
            validationErrors.push(`Class ${index + 1}: Name is required`);
        } else if (classNames.has(className.toLowerCase())) {
            validationErrors.push(`Class ${index + 1}: Name "${className}" is already used`);
        } else {
            classNames.add(className.toLowerCase());
        }
        
        if (!classYear) {
            validationErrors.push(`Class ${index + 1}: Year is required`);
        }
        
        const subjectForms = classForm.querySelectorAll('.subject-form');
        if (subjectForms.length === 0) {
            validationErrors.push(`Class ${index + 1}: At least one subject is required`);
        }
        
        // Validate subjects
        for (const [subIndex, subjectForm] of Array.from(subjectForms).entries()) {
            const subjectName = subjectForm.querySelector('.subject-name')?.value;
            const teacherCode = subjectForm.querySelector('.teacher-code')?.value;
            
            if (!subjectName) {
                validationErrors.push(`Class ${index + 1}, Subject ${subIndex + 1}: Subject name is required`);
            }
            
            if (!teacherCode) {
                validationErrors.push(`Class ${index + 1}, Subject ${subIndex + 1}: Teacher is required`);
            }
        }
    }
    
    if (validationErrors.length > 0) {
        showMessage(validationErrors.join('\n'), 'error');
        return;
    }
    
    // Save each class and its subjects
    for (const classForm of classForms) {
        const className = classForm.querySelector('.class-name').value.trim();
        const classData = {
            name: className,
            year: parseInt(classForm.querySelector('.class-year').value),
            division: classForm.querySelector('.class-division')?.value?.trim() || null,
            shift: classForm.querySelector('.class-shift').value || 'Morning',
            department_code: deptCode // Include department code
        };
        
        try {
            // Save class
            const classResponse = await fetch('/api/save_class', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(classData)
            });
            
            const classResult = await classResponse.json();
            if (!classResponse.ok) {
                throw new Error(classResult.error || 'Failed to save class');
            }
            
            // Save subjects for this class - SIMPLIFIED
            const subjectForms = classForm.querySelectorAll('.subject-form');
            for (const subjectForm of subjectForms) {
                const subjectName = subjectForm.querySelector('.subject-name')?.value;
                
                const subjectData = {
                    name: subjectName.trim(),
                    class_id: className, // Using class name as identifier
                    teacher_code: subjectForm.querySelector('.teacher-code').value.trim().toUpperCase(),
                    hours_per_week: subjectForm.querySelector('.hours-per-week')?.value ?
                        parseInt(subjectForm.querySelector('.hours-per-week').value) : 4,
                    needs_lab: subjectForm.querySelector('.subject-type')?.value === 'practical',
                    fixed_period: subjectForm.querySelector('.fixed-period')?.value ? 
                        parseInt(subjectForm.querySelector('.fixed-period').value) : null,
                    is_combined: subjectForm.querySelector('.combined-class')?.checked || false,
                    subject_type: subjectForm.querySelector('.subject-type')?.value || 'theory'
                };
                
                const subjectResponse = await fetch('/api/save_subject', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(subjectData)
                });
                
                const subjectResult = await subjectResponse.json();
                if (!subjectResponse.ok) {
                    throw new Error(subjectResult.error || 'Failed to save subject');
                }
            }
            
        } catch (error) {
            console.error('Error saving class:', error);
            showMessage(`Error saving class "${className}": ${error.message}`, 'error');
            return;
        }
    }
    
    savedClasses = Array.from(classForms).map(form => ({
        name: form.querySelector('.class-name').value.trim(),
        year: form.querySelector('.class-year').value
    }));
    
    showMessage('All classes and subjects saved successfully!', 'success');
    
    //Mark class section as completed
    document.querySelector('.progress-step[data-section="class-section"]').classList.add('completed');

    // Clear saved class data from localStorage
    const savedData = JSON.parse(localStorage.getItem(`timetable_form_data_${deptCode}`) || '{}');
    savedData.classes = [];
    localStorage.setItem(`timetable_form_data_${deptCode}`, JSON.stringify(savedData));
    
    showSection('constraints-section');
}

// Constraints and timetable generation
async function saveConstraints() {
    const deptCode = currentDepartmentCode || document.getElementById('dept-code').value.trim().toUpperCase();
    
    if (!deptCode) {
        showMessage('Please enter and save department details first', 'error');
        return false;
    }
    
    const workingDays = parseInt(document.getElementById('working-days').value);
    const periodsPerDay = parseInt(document.getElementById('periods-per-day').value);
    const breakPeriods = document.getElementById('break-periods').value.trim();
    const subjectGap = parseInt(document.getElementById('subject-gap').value) || 1;
    
    if (!workingDays || workingDays < 1 || workingDays > 7) {
        showMessage('Working days must be between 1 and 7', 'error');
        return false;
    }
    
    if (!periodsPerDay || periodsPerDay < 1 || periodsPerDay > 12) {
        showMessage('Periods per day must be between 1 and 12', 'error');
        return false;
    }
    
    // Validate break periods format
    if (breakPeriods) {
        const breakPeriodList = breakPeriods.split(',').map(p => p.trim());
        for (const period of breakPeriodList) {
            const periodNum = parseInt(period);
            if (isNaN(periodNum) || periodNum < 1 || periodNum > periodsPerDay) {
                showMessage(`Invalid break period: ${period}. Must be between 1 and ${periodsPerDay}`, 'error');
                return false;
            }
        }
    }
    
    const constraintsData = {
        working_days: workingDays,
        periods_per_day: periodsPerDay,
        break_periods: breakPeriods || null,
        subject_gap: subjectGap,
        department_code: deptCode // Include department code
    };
    
    try {
        const response = await fetch('/api/save_constraints', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(constraintsData)
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to save constraints');
        }
        
        return true;
    } catch (error) {
        console.error('Error saving constraints:', error);
        showMessage(`Error saving constraints: ${error.message}`, 'error');
        return false;
    }
}

async function generateTimetable() {
    const deptCode = currentDepartmentCode || document.getElementById('dept-code').value.trim().toUpperCase();
    
    if (!deptCode) {
        showMessage('Please enter and save department details first', 'error');
        return;
    }
    
    // Show loading message
    const resultsDiv = document.getElementById('timetable-results');
    resultsDiv.hidden = false;
    resultsDiv.innerHTML = `
        <div class="loading">
            <h3>Generating Timetable...</h3><br>
            <p>Please wait while we create your timetable for department ${deptCode}.</p>
        </div>
    `;
    
    try {
        // First save department if not already saved
        const deptName = document.getElementById('dept-name').value.trim();
        
        if (deptName && deptCode) {
            await saveDepartment();
        }
        
        // Save constraints
        const constraintsSaved = await saveConstraints();
        if (!constraintsSaved) {
            resultsDiv.innerHTML = '';
            return;
        }

        // Validate we have required data for this department
        const validationResponse = await fetch(`/api/validate_timetable_data/${deptCode}`);
        
        if (!validationResponse.ok) {
            throw new Error('Failed to validate data');
        }
        
        const validation = await validationResponse.json();
        
        if (!validation.valid) {
            throw new Error(validation.errors.join(', '));
        }
        
        if (validation.warnings.length > 0) {
            console.warn('Validation warnings:', validation.warnings);
        }

        // Generate timetable for this department
        const genResponse = await fetch(`/api/generate_timetable/${deptCode}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'}
        });
        
        if (!genResponse.ok) {
            const error = await genResponse.json();
            throw new Error(error.error || "Failed to generate timetable");
        }

        const timetable = await genResponse.json();

        // Save timetable to history
        saveTimetableToHistory(timetable);
        
        // Store in sessionStorage and redirect
        sessionStorage.setItem('timetableData', JSON.stringify(timetable));
        window.location.href = `/timetable?data=${encodeURIComponent(JSON.stringify(timetable))}&dept=${deptCode}`;
        
    } catch (error) {
        console.error("Generation error:", error);
        resultsDiv.innerHTML = `
            <div class="error">
                <h3>Timetable Generation Failed</h3>
                <p><strong>Error:</strong> ${error.message}</p>
                <div class="error-help">
                    <h4>Please check:</h4>
                    <ul>
                        <li>All teachers have been saved with subjects for department ${deptCode}</li>
                        <li>All classes have been saved with subjects for department ${deptCode}</li>
                        <li>Each subject has an assigned teacher from the same department</li>
                        <li>Constraints are within valid ranges</li>
                        <li>Database connection is working</li>
                    </ul>
                    <button onclick="location.reload()" class="btn-retry">Try Again</button>
                </div>
            </div>
        `;
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    // Add initial class form if none exist
    if (document.querySelectorAll('.class-form').length === 0) {
        addClassForm();
    }
    
    // Set up navigation event listeners
    document.querySelectorAll('.progress-step').forEach(step => {
        step.addEventListener('click', function() {
            if (this.classList.contains('completed') || this.classList.contains('active')) {
                showSection(this.dataset.section);
            }
        });
    });
    
    // Set up main event listeners
    const deptCodeInput = document.getElementById('dept-code');
    const addClassBtn = document.getElementById('add-class-btn');
    const saveClassBtn = document.getElementById('save-class-btn');
    const generateBtn = document.getElementById('generate-timetable-btn');
    
    if (deptCodeInput) {
        deptCodeInput.addEventListener('blur', checkDepartment);
        deptCodeInput.addEventListener('input', function() {
            currentDepartmentCode = this.value.trim().toUpperCase();
            updateDepartmentStatus();
        });
    }
    
    if (addClassBtn) addClassBtn.addEventListener('click', addClassForm);
    if (saveClassBtn) saveClassBtn.addEventListener('click', saveClass);
    if (generateBtn) generateBtn.addEventListener('click', generateTimetable);
    
    // Load initial data
    loadInitialData();
    loadSavedFormData();
    
    // Update department status on load
    updateDepartmentStatus();
    
    // Auto-save form data periodically
    setInterval(autoSaveFormData, 30000); // Every 30 seconds
});

// Auto-save functionality with department-specific keys
function autoSaveFormData() {
    const deptCode = currentDepartmentCode || document.getElementById('dept-code').value.trim().toUpperCase();
    if (!deptCode) return;
    
    try {
        const formData = {
            department: {
                name: document.getElementById('dept-name')?.value || '',
                code: deptCode
            },
            teachers: Array.from(document.querySelectorAll('.teacher-form')).map(form => ({
                name: form.querySelector('.teacher-name')?.value || '',
                code: form.querySelector('.teacher-code')?.value || '',
                subjects: Array.from(form.querySelectorAll('.subject-input')).map(input => input.value),
                working_hours: form.querySelector('.working-hours')?.value || 20,
                max_consecutive: form.querySelector('.max-consecutive')?.value || 3,
                min_free_periods: form.querySelector('.min-free-periods')?.value || 2
            })),
            classes: Array.from(document.querySelectorAll('.class-form')).map(form => ({
                name: form.querySelector('.class-name')?.value || '',
                year: form.querySelector('.class-year')?.value || '',
                division: form.querySelector('.class-division')?.value || '',
                shift: form.querySelector('.class-shift')?.value || 'Morning',
                subjects: Array.from(form.querySelectorAll('.subject-form')).map(subjectForm => ({
                    name: subjectForm.querySelector('.subject-name')?.value || '',
                    teacher_code: subjectForm.querySelector('.teacher-code')?.value || '',
                    hours_per_week: subjectForm.querySelector('.hours-per-week')?.value || 4,
                    subject_type: subjectForm.querySelector('.subject-type')?.value || 'theory',
                    fixed_period: subjectForm.querySelector('.fixed-period')?.value || '',
                    is_combined: subjectForm.querySelector('.combined-class')?.checked || false
                }))
            })),
            constraints: {
                working_days: document.getElementById('working-days')?.value || 5,
                periods_per_day: document.getElementById('periods-per-day')?.value || 6,
                break_periods: document.getElementById('break-periods')?.value || '',
                subject_gap: document.getElementById('subject-gap')?.value || 1
            },
            timestamp: new Date().toISOString()
        };
        
        // Save with department-specific key
        localStorage.setItem(`timetable_form_data_${deptCode}`, JSON.stringify(formData));
        console.log(`Auto-saved form data for department ${deptCode}`);
    } catch (error) {
        console.error("Auto-save failed:", error);
    }
}

// Helper function to add subject form with pre-filled data
async function addSubjectFormWithData(classId, subjectData) {
    try {
        // Add the subject form first
        await addSubjectForm(classId);
        
        // Wait a moment for the DOM to update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const container = document.querySelector(`#subjects-container-${classId}`);
        const lastSubjectForm = container?.lastElementChild;
        
        if (lastSubjectForm && subjectData) {
            // Fill in the form with saved data
            const subjectName = lastSubjectForm.querySelector('.subject-name');
            const teacherCode = lastSubjectForm.querySelector('.teacher-code');
            const hoursPerWeek = lastSubjectForm.querySelector('.hours-per-week');
            const subjectType = lastSubjectForm.querySelector('.subject-type');
            const fixedPeriod = lastSubjectForm.querySelector('.fixed-period');
            const combinedClass = lastSubjectForm.querySelector('.combined-class');
            
            // Only handle regular subjects 
            if (subjectName) subjectName.value = subjectData.name || '';
            
            // Wait for subject change to populate teachers, then set teacher
            if (subjectName) {
                subjectName.dispatchEvent(new Event('change'));
                
                // Wait for teachers to load, then set the teacher
                setTimeout(() => {
                    if (teacherCode) teacherCode.value = subjectData.teacher_code || '';
                }, 200);
            }
            
            if (hoursPerWeek) hoursPerWeek.value = subjectData.hours_per_week || 4;
            if (subjectType) subjectType.value = subjectData.subject_type || 'theory';
            if (fixedPeriod) fixedPeriod.value = subjectData.fixed_period || '';
            if (combinedClass) combinedClass.checked = subjectData.is_combined || false;
        }
    } catch (error) {
        console.error('Error adding subject form with data:', error);
        showMessage('Error loading subject data', 'error');
    }
}

// Clear all saved data for current department
function clearDepartmentData() {
    const deptCode = currentDepartmentCode || document.getElementById('dept-code').value.trim().toUpperCase();
    
    if (!deptCode) {
        showMessage('No department selected to clear', 'error');
        return;
    }
    
    if (confirm(`Are you sure you want to clear all saved data for department ${deptCode}? This action cannot be undone.`)) {
        // Clear form data
        localStorage.removeItem(`timetable_form_data_${deptCode}`);
        
        // Clear timetables
        localStorage.removeItem(`timetables_${deptCode}`);
        
        showMessage(`All data cleared for department ${deptCode}`, 'success');
        
        // Reload page
        setTimeout(() => {
            location.reload();
        }, 1500);
    }
}

// Add event listener for clear data button
document.addEventListener('DOMContentLoaded', function() {
    const clearDataBtn = document.getElementById('clear-data-btn');
    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', clearDepartmentData);
        clearDataBtn.textContent = 'Clear Department Data';
    }
});