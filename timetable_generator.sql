-- MySQL dump 10.13  Distrib 8.0.36, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: timetable_generator
-- ------------------------------------------------------
-- Server version	8.0.36

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Temporary view structure for view `class_subject_summary`
--

DROP TABLE IF EXISTS `class_subject_summary`;
/*!50001 DROP VIEW IF EXISTS `class_subject_summary`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `class_subject_summary` AS SELECT 
 1 AS `class_id`,
 1 AS `class_name`,
 1 AS `year`,
 1 AS `division`,
 1 AS `total_subjects`,
 1 AS `total_hours_per_week`,
 1 AS `lab_subjects_count`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `classes`
--

DROP TABLE IF EXISTS `classes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `year` int NOT NULL,
  `division` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shift` enum('Morning','Afternoon','Evening') COLLATE utf8mb4_unicode_ci DEFAULT 'Morning',
  `total_students` int DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_class_year` (`year`),
  KEY `idx_class_name` (`name`),
  KEY `idx_class_dept` (`department_id`),
  CONSTRAINT `classes_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `classes_chk_1` CHECK ((`year` between 1 and 4))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `classes`
--

LOCK TABLES `classes` WRITE;
/*!40000 ALTER TABLE `classes` DISABLE KEYS */;
INSERT INTO `classes` VALUES (1,'CSE',1,NULL,'Morning',NULL,1,1,'2025-09-05 02:37:44','2025-09-05 02:37:44'),(2,'I-AI',1,NULL,'Morning',NULL,3,1,'2025-09-05 13:37:02','2025-09-05 13:37:02');
/*!40000 ALTER TABLE `classes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `constraints`
--

DROP TABLE IF EXISTS `constraints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `constraints` (
  `id` int NOT NULL AUTO_INCREMENT,
  `working_days` int NOT NULL DEFAULT '5',
  `periods_per_day` int NOT NULL DEFAULT '6',
  `break_periods` text COLLATE utf8mb4_unicode_ci,
  `subject_gap` int DEFAULT '1',
  `max_periods_per_teacher_per_day` int DEFAULT '6',
  `avoid_first_last_period` tinyint(1) DEFAULT '0',
  `department_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_constraints_dept` (`department_id`),
  CONSTRAINT `constraints_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `constraints_chk_1` CHECK ((`working_days` between 1 and 7)),
  CONSTRAINT `constraints_chk_2` CHECK ((`periods_per_day` between 1 and 12))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `constraints`
--

LOCK TABLES `constraints` WRITE;
/*!40000 ALTER TABLE `constraints` DISABLE KEYS */;
INSERT INTO `constraints` VALUES (1,5,5,NULL,1,6,0,1,'2025-09-05 03:11:03','2025-09-05 03:11:03'),(2,5,6,NULL,1,6,0,3,'2025-09-05 13:37:15','2025-09-05 13:37:15');
/*!40000 ALTER TABLE `constraints` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `department_timetables`
--

DROP TABLE IF EXISTS `department_timetables`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `department_timetables` (
  `id` int NOT NULL AUTO_INCREMENT,
  `department_id` int NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `timetable_data` json NOT NULL,
  `class_count` int DEFAULT '0',
  `teacher_count` int DEFAULT '0',
  `working_days` int DEFAULT '5',
  `periods_per_day` int DEFAULT '6',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `department_id` (`department_id`),
  CONSTRAINT `department_timetables_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `department_timetables`
--

LOCK TABLES `department_timetables` WRITE;
/*!40000 ALTER TABLE `department_timetables` DISABLE KEYS */;
/*!40000 ALTER TABLE `department_timetables` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `departments`
--

DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_dept_code` (`code`),
  KEY `idx_dept_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `departments`
--

LOCK TABLES `departments` WRITE;
/*!40000 ALTER TABLE `departments` DISABLE KEYS */;
INSERT INTO `departments` VALUES (1,'Bachelor of Computer Application','BCA',NULL,'2025-09-05 02:36:36','2025-09-05 02:36:36'),(3,'Artificial Intelligence','AI',NULL,'2025-09-05 13:36:22','2025-09-05 13:36:22');
/*!40000 ALTER TABLE `departments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subjects`
--

DROP TABLE IF EXISTS `subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subjects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `class_id` int NOT NULL,
  `teacher_code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `hours_per_week` int DEFAULT '4',
  `needs_lab` tinyint(1) DEFAULT '0',
  `fixed_period` int DEFAULT NULL,
  `is_combined` tinyint(1) DEFAULT '0',
  `combined_with` text COLLATE utf8mb4_unicode_ci,
  `subject_type` enum('theory','practical','tutorial') COLLATE utf8mb4_unicode_ci DEFAULT 'theory',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_class_subject_teacher` (`class_id`,`name`,`teacher_code`),
  KEY `idx_subject_class` (`class_id`),
  KEY `idx_subject_teacher` (`teacher_code`),
  KEY `idx_subject_name` (`name`),
  KEY `idx_subjects_composite` (`class_id`,`teacher_code`,`subject_type`),
  CONSTRAINT `subjects_ibfk_1` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `subjects_ibfk_2` FOREIGN KEY (`teacher_code`) REFERENCES `teachers` (`code`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `subjects_chk_1` CHECK ((`fixed_period` between 1 and 12))
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subjects`
--

LOCK TABLES `subjects` WRITE;
/*!40000 ALTER TABLE `subjects` DISABLE KEYS */;
INSERT INTO `subjects` VALUES (1,'Java',1,'RJ',4,0,NULL,0,NULL,'theory','2025-09-05 02:37:45','2025-09-05 02:37:45'),(2,'Image Processing',1,'SS',4,0,NULL,0,NULL,'theory','2025-09-05 02:37:45','2025-09-05 02:37:45'),(3,'Java Lab',1,'RJ',3,0,NULL,0,NULL,'theory','2025-09-05 03:10:55','2025-09-05 03:10:55'),(4,'Deep learning',2,'LT',3,1,NULL,0,NULL,'practical','2025-09-05 13:37:02','2025-09-05 13:37:02'),(5,'Algebra',2,'LT',4,0,NULL,0,NULL,'theory','2025-09-05 13:37:13','2025-09-05 13:37:13');
/*!40000 ALTER TABLE `subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_availability`
--

DROP TABLE IF EXISTS `teacher_availability`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_availability` (
  `id` int NOT NULL AUTO_INCREMENT,
  `teacher_id` int NOT NULL,
  `day_of_week` enum('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_period` int NOT NULL,
  `end_period` int NOT NULL,
  `is_available` tinyint(1) DEFAULT '1',
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_availability_teacher` (`teacher_id`),
  KEY `idx_availability_day` (`day_of_week`),
  CONSTRAINT `teacher_availability_ibfk_1` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `teacher_availability_chk_1` CHECK ((`start_period` between 1 and 12)),
  CONSTRAINT `teacher_availability_chk_2` CHECK ((`end_period` between 1 and 12)),
  CONSTRAINT `teacher_availability_chk_3` CHECK ((`end_period` >= `start_period`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_availability`
--

LOCK TABLES `teacher_availability` WRITE;
/*!40000 ALTER TABLE `teacher_availability` DISABLE KEYS */;
/*!40000 ALTER TABLE `teacher_availability` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_subjects`
--

DROP TABLE IF EXISTS `teacher_subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_subjects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `teacher_id` int NOT NULL,
  `subject_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `proficiency_level` enum('Expert','Intermediate','Basic') COLLATE utf8mb4_unicode_ci DEFAULT 'Intermediate',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_teacher_subject` (`teacher_id`,`subject_name`),
  KEY `idx_ts_teacher` (`teacher_id`),
  KEY `idx_ts_subject` (`subject_name`),
  KEY `idx_teacher_subjects_composite` (`teacher_id`,`subject_name`),
  CONSTRAINT `teacher_subjects_ibfk_1` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=49 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_subjects`
--

LOCK TABLES `teacher_subjects` WRITE;
/*!40000 ALTER TABLE `teacher_subjects` DISABLE KEYS */;
INSERT INTO `teacher_subjects` VALUES (39,4,'Statistics','Intermediate','2025-09-05 03:10:38'),(40,4,'Mathematics','Intermediate','2025-09-05 03:10:38'),(41,2,'Java','Intermediate','2025-09-05 03:10:38'),(43,2,'Java Lab','Intermediate','2025-09-05 03:10:38'),(45,1,'Operating System','Intermediate','2025-09-05 03:10:38'),(46,1,'Image Processing','Intermediate','2025-09-05 03:10:38'),(47,5,'Deep learning','Intermediate','2025-09-05 13:36:22'),(48,5,'Algebra','Intermediate','2025-09-05 13:36:22');
/*!40000 ALTER TABLE `teacher_subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `teacher_workload`
--

DROP TABLE IF EXISTS `teacher_workload`;
/*!50001 DROP VIEW IF EXISTS `teacher_workload`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `teacher_workload` AS SELECT 
 1 AS `id`,
 1 AS `name`,
 1 AS `code`,
 1 AS `total_subjects`,
 1 AS `total_hours_per_week`,
 1 AS `working_hours`,
 1 AS `workload_percentage`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `teachers`
--

DROP TABLE IF EXISTS `teachers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teachers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `working_hours` int DEFAULT '20',
  `max_consecutive` int DEFAULT '3',
  `department_id` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `min_free_periods_per_day` int DEFAULT '2',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_teacher_code` (`code`),
  KEY `idx_teacher_name` (`name`),
  KEY `idx_teacher_dept` (`department_id`),
  CONSTRAINT `teachers_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teachers`
--

LOCK TABLES `teachers` WRITE;
/*!40000 ALTER TABLE `teachers` DISABLE KEYS */;
INSERT INTO `teachers` VALUES (1,'Sorna Selvi','SS',NULL,NULL,16,2,1,1,'2025-09-05 02:36:36','2025-09-05 03:10:38',1),(2,'Rajeshwari','RJ',NULL,NULL,16,2,1,1,'2025-09-05 02:36:36','2025-09-05 02:36:36',1),(4,'Vennila','AV',NULL,NULL,16,2,1,1,'2025-09-05 02:36:36','2025-09-05 02:36:36',1),(5,'Lalitha','LT',NULL,NULL,16,3,3,1,'2025-09-05 13:36:22','2025-09-05 13:36:22',1);
/*!40000 ALTER TABLE `teachers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `timetable_history`
--

DROP TABLE IF EXISTS `timetable_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timetable_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `version_number` int NOT NULL,
  `department_id` int DEFAULT NULL,
  `generated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `generation_method` enum('automatic','manual','hybrid') COLLATE utf8mb4_unicode_ci DEFAULT 'automatic',
  `total_conflicts` int DEFAULT '0',
  `generation_time_seconds` decimal(10,3) DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_dept` (`department_id`),
  KEY `idx_history_version` (`version_number`),
  KEY `idx_history_active` (`is_active`),
  CONSTRAINT `timetable_history_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `timetable_history`
--

LOCK TABLES `timetable_history` WRITE;
/*!40000 ALTER TABLE `timetable_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `timetable_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `timetable_slots`
--

DROP TABLE IF EXISTS `timetable_slots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timetable_slots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `class_id` int NOT NULL,
  `day_of_week` enum('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') COLLATE utf8mb4_unicode_ci NOT NULL,
  `period_number` int NOT NULL,
  `subject_id` int DEFAULT NULL,
  `teacher_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_break` tinyint(1) DEFAULT '0',
  `is_lunch` tinyint(1) DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `timetable_version` int DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_class_day_period` (`class_id`,`day_of_week`,`period_number`,`timetable_version`),
  KEY `subject_id` (`subject_id`),
  KEY `idx_timetable_class` (`class_id`),
  KEY `idx_timetable_teacher` (`teacher_code`),
  KEY `idx_timetable_day` (`day_of_week`),
  KEY `idx_timetable_period` (`period_number`),
  KEY `idx_timetable_version` (`timetable_version`),
  KEY `idx_timetable_composite` (`class_id`,`day_of_week`,`period_number`),
  CONSTRAINT `timetable_slots_ibfk_1` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `timetable_slots_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `timetable_slots_ibfk_3` FOREIGN KEY (`teacher_code`) REFERENCES `teachers` (`code`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `timetable_slots_chk_1` CHECK ((`period_number` between 1 and 12))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `timetable_slots`
--

LOCK TABLES `timetable_slots` WRITE;
/*!40000 ALTER TABLE `timetable_slots` DISABLE KEYS */;
/*!40000 ALTER TABLE `timetable_slots` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Final view structure for view `class_subject_summary`
--

/*!50001 DROP VIEW IF EXISTS `class_subject_summary`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `class_subject_summary` AS select `c`.`id` AS `class_id`,`c`.`name` AS `class_name`,`c`.`year` AS `year`,`c`.`division` AS `division`,count(`s`.`id`) AS `total_subjects`,sum(`s`.`hours_per_week`) AS `total_hours_per_week`,sum((case when (`s`.`needs_lab` = true) then 1 else 0 end)) AS `lab_subjects_count` from (`classes` `c` left join `subjects` `s` on((`c`.`id` = `s`.`class_id`))) where (`c`.`is_active` = true) group by `c`.`id`,`c`.`name`,`c`.`year`,`c`.`division` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `teacher_workload`
--

/*!50001 DROP VIEW IF EXISTS `teacher_workload`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `teacher_workload` AS select `t`.`id` AS `id`,`t`.`name` AS `name`,`t`.`code` AS `code`,count(`s`.`id`) AS `total_subjects`,sum(`s`.`hours_per_week`) AS `total_hours_per_week`,`t`.`working_hours` AS `working_hours`,((sum(`s`.`hours_per_week`) / `t`.`working_hours`) * 100) AS `workload_percentage` from (`teachers` `t` left join `subjects` `s` on((`t`.`code` = `s`.`teacher_code`))) where (`t`.`is_active` = true) group by `t`.`id`,`t`.`name`,`t`.`code`,`t`.`working_hours` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-09-07 19:15:29
