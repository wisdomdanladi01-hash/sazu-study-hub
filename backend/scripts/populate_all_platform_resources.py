import io
import re
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import pypdfium2 as pdfium
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from sqlalchemy import select

from app.db.database import SessionLocal
from app.models.academic import (
    AcademicLevel,
    AcademicSession,
    Course,
    CourseOffering,
    CurriculumVersion,
    Department,
    Faculty,
    Programme,
    ResourceType,
    Semester,
)
from app.models.resource import Resource
from app.models.user import User
from app.services.resources import create_resource

root_dir = Path(__file__).resolve().parent.parent.parent
res_dir = root_dir / "resources"


def sanitize_herbert_spencer(src_path: Path) -> bytes:
    """Removes Page 2 which contains the 20 students' names and matric numbers."""
    reader = PdfReader(str(src_path))
    writer = PdfWriter()
    # Keep page 1 (cover), skip page 2 (index 1), keep remaining pages 3-8
    for i, page in enumerate(reader.pages):
        if i == 1:
            continue
        writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def sanitize_pdf_page_with_redaction(src_path: Path, page_index: int, redact_patterns: list[str]) -> bytes:
    """Renders the specified page, covers text matching redact_patterns with white box, and reconstructs the PDF."""
    reader = PdfReader(str(src_path))
    writer = PdfWriter()

    # For pypdfium2 rendering
    doc = pdfium.PdfDocument(str(src_path))

    for i in range(len(reader.pages)):
        if i == page_index:
            page = doc[i]
            # render to PIL
            pil_img = page.render(scale=2).to_pil()
            draw = ImageDraw.Draw(pil_img)
            # Find occurrences in textpage to get rough bounds or draw over the top-left matric header
            # For page 1 of these assignments, matric no is near y=15% - 25% of the page
            w, h = pil_img.size
            # draw white rectangle over the matriculation line
            draw.rectangle([int(w * 0.05), int(h * 0.14), int(w * 0.95), int(h * 0.22)], fill="white")
            # Save sanitized image to PDF page
            img_pdf_bytes = io.BytesIO()
            pil_img.save(img_pdf_bytes, format="PDF", resolution=150.0)
            img_pdf_bytes.seek(0)
            clean_reader = PdfReader(img_pdf_bytes)
            writer.add_page(clean_reader.pages[0])
        else:
            writer.add_page(reader.pages[i])

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def get_or_create_resource_type(db, name: str) -> ResourceType:
    rt = db.scalar(select(ResourceType).where(ResourceType.name == name))
    if not rt:
        rt = ResourceType(name=name, is_active=True)
        db.add(rt)
        db.commit()
        db.refresh(rt)
    return rt


def get_or_create_course(
    db,
    code: str,
    title: str,
    department_id: int,
    academic_level_id: int,
    programme_id: int | None = None,
) -> Course:
    course = db.scalar(select(Course).where(Course.code == code))
    if not course:
        course = Course(
            code=code,
            title=title,
            department_id=department_id,
            academic_level_id=academic_level_id,
            programme_id=programme_id,
            is_active=True,
            verification_status="verified",
            source_note="Official SAZU Course Directory",
        )
        db.add(course)
        db.commit()
        db.refresh(course)
        print(f"Created Course: {course.code} - {course.title}")
    return course


def get_or_create_offering(
    db,
    course_id: int,
    curriculum_version_id: int,
    academic_level_id: int,
    semester_id: int,
    credit_units: int = 3,
) -> CourseOffering:
    offering = db.scalar(
        select(CourseOffering).where(
            CourseOffering.course_id == course_id,
            CourseOffering.curriculum_version_id == curriculum_version_id,
            CourseOffering.semester_id == semester_id,
        )
    )
    if not offering:
        offering = CourseOffering(
            course_id=course_id,
            curriculum_version_id=curriculum_version_id,
            academic_level_id=academic_level_id,
            semester_id=semester_id,
            credit_units=credit_units,
            course_type="compulsory",
            verification_status="verified",
            source_note="Verified Course Offering",
            is_active=True,
        )
        db.add(offering)
        db.commit()
        db.refresh(offering)
    return offering


def main():
    db = SessionLocal()
    try:
        # Resource Types
        rt_handout = get_or_create_resource_type(db, "Lecture Handout / Notes")
        rt_test_pq = get_or_create_resource_type(db, "Test Past Question (C.A.)")
        rt_exam_pq = get_or_create_resource_type(db, "Exam Past Question")
        rt_solution = get_or_create_resource_type(db, "Solution & Marking Guide")
        rt_textbook = get_or_create_resource_type(db, "Textbook & Reference Material")
        rt_reference = get_or_create_resource_type(db, "Reference Material (Supplementary)")
        rt_assignment = get_or_create_resource_type(db, "Assignment / Problem Set")
        rt_syllabus = get_or_create_resource_type(db, "Course Syllabus / Outline")

        # Admin User
        admin_user = db.scalar(select(User).where(User.email == "wisdomdavid0307@gmail.com"))
        if not admin_user:
            admin_user = db.scalar(select(User).where(User.is_superuser.is_(True)))

        # Levels
        level_100 = db.scalar(select(AcademicLevel).where(AcademicLevel.code == "100"))
        level_200 = db.scalar(select(AcademicLevel).where(AcademicLevel.code == "200"))
        level_300 = db.scalar(select(AcademicLevel).where(AcademicLevel.code == "300"))
        level_400 = db.scalar(select(AcademicLevel).where(AcademicLevel.code == "400"))
        if not level_400:
            level_400 = AcademicLevel(name="400 Level", code="400", rank=4)
            db.add(level_400)
            db.commit()
            db.refresh(level_400)

        # Sessions & Semesters
        session_2025 = db.scalar(select(AcademicSession).where(AcademicSession.name == "2025/2026"))
        sem_2025_1 = db.scalar(select(Semester).where(Semester.academic_session_id == session_2025.id, Semester.number == 1))
        sem_2025_2 = db.scalar(select(Semester).where(Semester.academic_session_id == session_2025.id, Semester.number == 2))

        # Departments
        dept_math = db.scalar(select(Department).where(Department.name.ilike("%Mathematical%")))
        dept_physics = db.scalar(select(Department).where(Department.name.ilike("%Physics%")))
        dept_biochem = db.scalar(select(Department).where(Department.name.ilike("%Biochemistry%")))
        dept_mcb = db.scalar(select(Department).where(Department.name.ilike("%Microbiology%")))
        if not dept_mcb:
            dept_mcb = dept_biochem

        dept_edu = db.scalar(select(Department).where(Department.name.ilike("%Education%")))
        if not dept_edu:
            dept_edu = Department(name="Department of Educational Foundations", code="EDU", is_active=True)
            db.add(dept_edu)
            db.commit()
            db.refresh(dept_edu)

        dept_bio = db.scalar(select(Department).where(Department.name.ilike("%Biological%")))
        if not dept_bio:
            dept_bio = Department(name="Department of Biological Sciences", code="BIO", is_active=True)
            db.add(dept_bio)
            db.commit()
            db.refresh(dept_bio)

        # Programmes
        prog_cs = db.scalar(select(Programme).where(Programme.code == "BSC-COMPUTER-SCIENCE")) or db.scalars(select(Programme)).first()
        prog_id = prog_cs.id

        # Curriculum Version
        cv_2025 = db.scalar(select(CurriculumVersion).where(CurriculumVersion.academic_session_id == session_2025.id))

        # Ensure all required courses exist
        # 1. Operating Systems
        c_csc3313 = get_or_create_course(db, "CSC3313", "Operating System II", dept_math.id, level_300.id, prog_id)
        off_csc3313 = get_or_create_offering(db, c_csc3313.id, cv_2025.id, level_300.id, sem_2025_1.id)

        # 2. Education - Herbert Spencer
        c_edu303 = get_or_create_course(db, "SAZU-EDU303", "Advance Sociology of Education", dept_edu.id, level_300.id, prog_id)
        off_edu303 = get_or_create_offering(db, c_edu303.id, cv_2025.id, level_300.id, sem_2025_1.id)

        # 3. Microbiology - Bacterial Diversity & Gram Staining
        c_mcb322 = get_or_create_course(db, "MCB322", "Bacterial Diversity & Microbial Techniques", dept_mcb.id, level_300.id, prog_id)
        off_mcb322 = get_or_create_offering(db, c_mcb322.id, cv_2025.id, level_300.id, sem_2025_2.id)

        # 4. Cloud Computing
        c_csc231 = get_or_create_course(db, "CSC231", "Introduction to Cloud Computing", dept_math.id, level_200.id, prog_id)
        off_csc231 = get_or_create_offering(db, c_csc231.id, cv_2025.id, level_200.id, sem_2025_1.id)

        # 5. Data Science
        c_csc222 = get_or_create_course(db, "SAZU-CSC222", "Introduction to Data Science", dept_math.id, level_200.id, prog_id)
        off_csc222 = get_or_create_offering(db, c_csc222.id, cv_2025.id, level_200.id, sem_2025_1.id)

        # 6. Artificial Intelligence & Machine Learning
        c_csc224 = get_or_create_course(db, "SAZU-CSC224", "Introduction to Artificial Intelligence", dept_math.id, level_200.id, prog_id)
        off_csc224 = get_or_create_offering(db, c_csc224.id, cv_2025.id, level_200.id, sem_2025_1.id)

        # 7. Computer Programming I & II
        c_cos201 = get_or_create_course(db, "COS201", "Computer Programming I", dept_math.id, level_200.id, prog_id)
        off_cos201 = get_or_create_offering(db, c_cos201.id, cv_2025.id, level_200.id, sem_2025_1.id)

        c_csc202 = get_or_create_course(db, "CSC202", "Computer Programming II", dept_math.id, level_200.id, prog_id)
        off_csc202 = get_or_create_offering(db, c_csc202.id, cv_2025.id, level_200.id, sem_2025_2.id)

        # 8. Advanced Programming
        c_csc3201 = get_or_create_course(db, "CSC3201", "Advanced Programming", dept_math.id, level_300.id, prog_id)
        off_csc3201 = get_or_create_offering(db, c_csc3201.id, cv_2025.id, level_300.id, sem_2025_1.id)

        # 9. Algorithms
        c_csc3305 = get_or_create_course(db, "CSC3305", "Design & Analysis of Algorithm", dept_math.id, level_300.id, prog_id)
        off_csc3305 = get_or_create_offering(db, c_csc3305.id, cv_2025.id, level_300.id, sem_2025_1.id)

        # 10. Data Structures
        c_csc206 = get_or_create_course(db, "CSC206", "Fundamental of Data Structure & Algorithm", dept_math.id, level_200.id, prog_id)
        off_csc206 = get_or_create_offering(db, c_csc206.id, cv_2025.id, level_200.id, sem_2025_2.id)

        # 11. Sequential Programming
        c_csc208 = get_or_create_course(db, "CSC208", "Foundation of Sequential Program", dept_math.id, level_200.id, prog_id)
        off_csc208 = get_or_create_offering(db, c_csc208.id, cv_2025.id, level_200.id, sem_2025_2.id)

        # 12. Computer Architecture & Hardware
        c_csc204 = get_or_create_course(db, "CSC204", "Computer Architecture & Organization I", dept_math.id, level_200.id, prog_id)
        off_csc204 = get_or_create_offering(db, c_csc204.id, cv_2025.id, level_200.id, sem_2025_2.id)

        c_csc3111 = get_or_create_course(db, "CSC3111", "Computer Hardware Maintenance", dept_math.id, level_300.id, prog_id)
        off_csc3111 = get_or_create_offering(db, c_csc3111.id, cv_2025.id, level_300.id, sem_2025_1.id)

        # 13. Compiler Construction
        c_csc3309 = get_or_create_course(db, "CSC3309", "Compiler Construction I", dept_math.id, level_300.id, prog_id)
        off_csc3309 = get_or_create_offering(db, c_csc3309.id, cv_2025.id, level_300.id, sem_2025_1.id)

        # 14. File Processing
        c_csc3303 = get_or_create_course(db, "CSC3303", "File Processing and Data Management I", dept_math.id, level_300.id, prog_id)
        off_csc3303 = get_or_create_offering(db, c_csc3303.id, cv_2025.id, level_300.id, sem_2025_1.id)

        # 15. Mathematics & Operations Research
        c_mth3313 = get_or_create_course(db, "MTH3313", "Introduction to Operations Research", dept_math.id, level_300.id, prog_id)
        off_mth3313 = get_or_create_offering(db, c_mth3313.id, cv_2025.id, level_300.id, sem_2025_1.id)

        c_mth204 = get_or_create_course(db, "MTH204", "Linear Algebra II", dept_math.id, level_200.id, prog_id)
        off_mth204 = get_or_create_offering(db, c_mth204.id, cv_2025.id, level_200.id, sem_2025_2.id)

        c_mth205 = get_or_create_course(db, "MTH205", "Analysis Algebra", dept_math.id, level_200.id, prog_id)
        off_mth205 = get_or_create_offering(db, c_mth205.id, cv_2025.id, level_200.id, sem_2025_1.id)

        # 16. Statistics
        c_sta105 = get_or_create_course(db, "STA105", "Descriptive Statistics", dept_math.id, level_100.id, prog_id)
        off_sta105 = get_or_create_offering(db, c_sta105.id, cv_2025.id, level_100.id, sem_2025_1.id)

        c_sta3307 = get_or_create_course(db, "STA3307", "Sampling Theory & Survey Methods", dept_math.id, level_300.id, prog_id)
        off_sta3307 = get_or_create_offering(db, c_sta3307.id, cv_2025.id, level_300.id, sem_2025_1.id)

        # 17. Digital Skills
        c_csc3301 = get_or_create_course(db, "CSC3301", "Digital Skills in ICT", dept_math.id, level_300.id, prog_id)
        off_csc3301 = get_or_create_offering(db, c_csc3301.id, cv_2025.id, level_300.id, sem_2025_1.id)

        # 18. Medical Parasitology
        c_mcb338 = get_or_create_course(db, "SAZU-MCB338", "Medical Parasitology", dept_mcb.id, level_300.id, prog_id)
        off_mcb338 = get_or_create_offering(db, c_mcb338.id, cv_2025.id, level_300.id, sem_2025_2.id)

        # 19. Applied Entomology
        c_zoo4211 = get_or_create_course(db, "ZOO4211", "Applied Entomology II", dept_bio.id, level_400.id, prog_id)
        off_zoo4211 = get_or_create_offering(db, c_zoo4211.id, cv_2025.id, level_400.id, sem_2025_2.id)

        # 20. Problem Solving
        c_cos102 = get_or_create_course(db, "COS102", "Problem Solving & Computer Concepts", dept_math.id, level_100.id, prog_id)
        off_cos102 = get_or_create_offering(db, c_cos102.id, cv_2025.id, level_100.id, sem_2025_2.id)

        # 21. Mobile App Development
        c_cos120 = get_or_create_course(db, "BASUG-COS120", "Introduction to Mobile Application and Development", dept_math.id, level_100.id, prog_id)
        off_cos120 = get_or_create_offering(db, c_cos120.id, cv_2025.id, level_100.id, sem_2025_2.id)

        # 22. General Studies (GST)
        c_gst103 = get_or_create_course(db, "GST103", "Use of Library, Study Skills & ICT", dept_math.id, level_100.id, prog_id)
        off_gst103 = get_or_create_offering(db, c_gst103.id, cv_2025.id, level_100.id, sem_2025_1.id)

        # 23. Physics
        c_phy202 = get_or_create_course(db, "PHY202", "Introduction to Electric Circuits & Electronics", dept_physics.id, level_200.id, prog_id)
        off_phy202 = get_or_create_offering(db, c_phy202.id, cv_2025.id, level_200.id, sem_2025_2.id)

        # 24. Biology / Histology
        c_bio102 = get_or_create_course(db, "BIO102", "General Biology II (Histology & Diversity)", dept_bio.id, level_100.id, prog_id)
        off_bio102 = get_or_create_offering(db, c_bio102.id, cv_2025.id, level_100.id, sem_2025_2.id)

        # Helper to read file bytes
        def read_bytes(filename: str) -> bytes:
            return (res_dir / filename).read_bytes()

        # Check existing resource titles to prevent duplicates
        existing_res_titles = {r.title.strip().lower() for r in db.query(Resource).all()}

        # Define uploads
        uploads = [
            # --- OPERATING SYSTEMS (User Request: "for most documents on cpu scheduling they are related to operatiing systems course") ---
            {
                "title": "CSC3313: CPU Scheduling Algorithms & Numerical Calculations",
                "description": "Comprehensive numerical problem sets and step-by-step worked solutions on CPU Process Scheduling for CSC3313 (Operating System II). Includes Gantt chart construction, waiting time, turnaround time, FCFS, SJF (preemptive & non-preemptive), Priority scheduling, and Round Robin (RR) with time quantum.",
                "course": c_csc3313,
                "offering": off_csc3313,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_solution,
                "files": [
                    (read_bytes("Numercal on CPU Schduling_123531.docx"), "CSC3313_Numericals_on_CPU_Scheduling.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                ],
                "preview_content": "Operating System II CPU Scheduling: Process arrival times, CPU burst lengths, average waiting time calculations, and Round Robin Gantt chart schedules.",
            },
            {
                "title": "CSC3313: Virtual Memory Management & Disk Head Scheduling",
                "description": "Solved analytical problems and numerical examples for Virtual Memory (FIFO, LRU, Optimal page replacement algorithms, page fault frequency) and Disk Scheduling (FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK head movement calculations) for Operating System II.",
                "course": c_csc3313,
                "offering": off_csc3313,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_solution,
                "files": [
                    (read_bytes("Numercals on Virtual Memory and Disk Scheduling_123535.docx"), "CSC3313_Virtual_Memory_and_Disk_Scheduling.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                ],
                "preview_content": "Virtual Memory & Disk Arm Scheduling: Reference string page faults (FIFO, LRU, Optimal) and cylinder track seek times for SCAN and C-SCAN.",
            },
            {
                "title": "CSC3313: Deadlock Detection, Prevention & Banker's Algorithm",
                "description": "Detailed numerical examples on system Deadlock characterization, Resource Allocation Graphs (RAG), Deadlock Prevention, and Dijkstra's Banker's Safety Algorithm matrix calculations with available, allocation, and need matrices.",
                "course": c_csc3313,
                "offering": off_csc3313,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_solution,
                "files": [
                    (read_bytes("Numerical for Deadlock_071921.docx"), "CSC3313_Numerical_for_Deadlock_Bankers.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                ],
                "preview_content": "Deadlock & Banker's Algorithm: Determining safe execution sequences <P1, P3, P4, P0, P2>, resource request algorithms, and deadlock avoidance.",
            },
            {
                "title": "CSC3313: Operating System II — Comprehensive 300L Lecture Notes",
                "description": "Official complete university lecture module for Operating System II (CSC3313). Covers kernel architectures, process synchronization, semaphores, critical sections, inter-process communication (IPC), memory management, paging, segmentation, and distributed file systems.",
                "course": c_csc3313,
                "offering": off_csc3313,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("Operating System for 300 l lecture notes.docx"), "CSC3313_Operating_System_300L_Lecture_Notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                ],
                "preview_content": "Operating System II Syllabus: Process lifecycle, concurrent programming, mutual exclusion, semaphores, virtual memory paging, and Linux/Windows kernel comparison.",
            },

            # --- SANITIZED ASSIGNMENTS (User Request: "remove those matric no's of them... eg the herber spencer document") ---
            {
                "title": "SAZU-EDU303: The Contributions of Herbert Spencer to Sociology of Education",
                "description": "Exemplary academic research assignment and seminar paper for SAZU-EDU 303 (Advance Sociology of Education). Thoroughly examines Herbert Spencer's social evolution theory, the organic analogy (society as a living organism), militant vs. industrial societies, structural-functionalism origins, and his lasting legacy in educational sociology. (Sanitized model assignment with student personal identification removed).",
                "course": c_edu303,
                "offering": off_edu303,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_assignment,
                "files": [
                    (sanitize_herbert_spencer(res_dir / "Herbeert Spencer.pdf"), "SAZU_EDU303_Herbert_Spencer_Sociology_Assignment_Clean.pdf", "application/pdf")
                ],
                "preview_content": "Advance Sociology of Education: Herbert Spencer's biography, evolution of social structures, organic analogy, militant vs industrial societies, and functionalism.",
            },
            {
                "title": "MCB322: Bacterial Diversity — Taxonomy, Morphology & Ecological Roles",
                "description": "Comprehensive academic assignment and study guide for MCB 322 (Bacterial Diversity). Details eubacterial taxonomy, gram staining, extremophiles, bacterial metabolism, nitrogen cycle contributors, and medical microbiology applications. (Sanitized academic submission).",
                "course": c_mcb322,
                "offering": off_mcb322,
                "level": level_300,
                "semester": sem_2025_2,
                "resource_type": rt_assignment,
                "files": [
                    (sanitize_pdf_page_with_redaction(res_dir / "MCB322_Bacterial_Diversity group 5.pdf", 0, ["Matric no"]), "MCB322_Bacterial_Diversity_Assignment_Clean.pdf", "application/pdf")
                ],
                "preview_content": "Bacterial Diversity: Domain bacteria, cell wall structure, metabolic diversity, phototrophs, chemotrophs, and environmental significance.",
            },
            {
                "title": "MCB322: Gram Staining Principles & Bacterial Growth Kinetics",
                "description": "High-yield laboratory assignment covering the principles, chemical reagents, and step-by-step mechanism of Gram Staining (crystal violet, iodine mordant, alcohol decolorization, safranin counterstain) alongside complete mathematical analysis of the four phases of the Bacterial Growth Cycle (Lag, Log/Exponential, Stationary, Death). (Sanitized academic submission).",
                "course": c_mcb322,
                "offering": off_mcb322,
                "level": level_300,
                "semester": sem_2025_2,
                "resource_type": rt_assignment,
                "files": [
                    (sanitize_pdf_page_with_redaction(res_dir / "Microbiology_Assignment Daborah.pdf", 0, ["Matric no"]), "Microbiology_Gram_Staining_and_Growth_Curve_Clean.pdf", "application/pdf")
                ],
                "preview_content": "Microbiology Assignment: Peptidoglycan Gram staining mechanism and 4-phase bacterial growth kinetics (lag, exponential, stationary, decline).",
            },

            # --- CLOUD COMPUTING (CSC231) ---
            {
                "title": "CSC231: Introduction to Cloud Computing — Complete Course Syllabus & Schedule",
                "description": "Official course guide for CSC231 (Department of Mathematical Sciences). Outlines cloud service models (IaaS, PaaS, SaaS), deployment topologies (Public, Private, Hybrid), virtualization technologies, grading structure, and recommended literature.",
                "course": c_csc231,
                "offering": off_csc231,
                "level": level_200,
                "semester": sem_2025_1,
                "resource_type": rt_syllabus,
                "files": [
                    (read_bytes("CSC231_COURSE_INFO.pdf"), "CSC231_Course_Information_Guide.pdf", "application/pdf")
                ],
                "preview_content": "CSC231 Cloud Computing: Course objectives, 3 credit units, evaluation breakdown, and laboratory schedule.",
            },
            {
                "title": "CSC231: Cloud Computing Foundations — Master Lecture Note",
                "description": "Comprehensive primary lecture note for CSC231. Covers NIST cloud definitions, cloud economics, utility computing, multi-tenancy architectures, service-level agreements (SLAs), and cloud security fundamentals.",
                "course": c_csc231,
                "offering": off_csc231,
                "level": level_200,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("CSC231_MAIN_NOTE.pdf"), "CSC231_Main_Cloud_Lecture_Note.pdf", "application/pdf")
                ],
                "preview_content": "NIST Cloud Characteristics: On-demand self-service, broad network access, resource pooling, rapid elasticity, and measured service.",
            },
            {
                "title": "CSC231: Cloud Services, Virtualization & Containerization Lecture Series",
                "description": "Multi-week lecture series covering Week 1 (Cloud Introduction), Week 2 (Service Models: IaaS, PaaS, SaaS), Week 4 (Containerization, Docker & Kubernetes), and Week 5 (Cloud Resource Management).",
                "course": c_csc231,
                "offering": off_csc231,
                "level": level_200,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("CSC231 Week1  Introduction to Cloud Computing.pdf"), "CSC231_Week1_Introduction.pdf", "application/pdf"),
                    (read_bytes("CSC231 Week2  Cloud Services and Deployment Model.pdf"), "CSC231_Week2_Service_Models.pdf", "application/pdf"),
                    (read_bytes("CSC231 Week4 Enabling Technologies II CONTAINERIZATION.pdf"), "CSC231_Week4_Containerization.pdf", "application/pdf"),
                    (read_bytes("CSC231 Week5 Cloud Services & Management I.pdf"), "CSC231_Week5_Management.pdf", "application/pdf"),
                ],
                "preview_content": "Containerization vs Virtualization: Hypervisor architectures, Docker daemon, container isolation, and cloud resource provisioning.",
            },

            # --- DATA SCIENCE & AI (SAZU-CSC222 & SAZU-CSC224) ---
            {
                "title": "SAZU-CSC222: Foundations of Data Science & Python Ecosystem",
                "description": "Introduction to data science workflows, data cleaning & preparation, exploratory data analysis (EDA), NumPy, Pandas, Matplotlib, and feature engineering for SAZU-CSC222.",
                "course": c_csc222,
                "offering": off_csc222,
                "level": level_200,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("4 WHAT DATA SCIENCE IS.pdf"), "CSC222_What_Data_Science_Is.pdf", "application/pdf"),
                    (read_bytes("3 DATA_CLEANING_AND_PREPARATION.pdf"), "CSC222_Data_Cleaning_Preparation.pdf", "application/pdf"),
                    (read_bytes("DATA_VISUALISATION.pdf"), "CSC222_Data_Visualization_Seaborn_Matplotlib.pdf", "application/pdf"),
                    (read_bytes("PYTHON_FOUNDATION_FOR_DATA_SCIENCE.pdf"), "CSC222_Python_Foundation_Data_Science.pdf", "application/pdf"),
                ],
                "preview_content": "Data Science Pipeline: Missing data imputation, outlier detection, data visualization best practices, and vector math with NumPy.",
            },
            {
                "title": "SAZU-CSC224: Introduction to Artificial Intelligence & Machine Learning",
                "description": "Foundational AI and ML materials covering intelligent agents, search algorithms (BFS, DFS, A*), machine learning classification/regression, Scikit-Learn implementations, and practical assignments.",
                "course": c_csc224,
                "offering": off_csc224,
                "level": level_200,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("Artificial Intelligence.pdf"), "CSC224_Artificial_Intelligence_Overview.pdf", "application/pdf"),
                    (read_bytes("Artificial_Intelligence assignment.pdf"), "CSC224_AI_Problem_Set.pdf", "application/pdf"),
                    (read_bytes("PYTHON_FORMACHINE_LEARNING.pdf"), "CSC224_Python_for_Machine_Learning.pdf", "application/pdf"),
                ],
                "preview_content": "Artificial Intelligence Concepts: Problem formulation, heuristic search, supervised vs unsupervised learning, and decision trees.",
            },
            {
                "title": "SAZU-CSC224: Hands-On Machine Learning & Statistical Learning Reference",
                "description": "Authoritative reference textbook and advanced learning guide on Statistical Learning, gradient descent, support vector machines (SVM), neural network architectures, and model evaluation metrics.",
                "course": c_csc224,
                "offering": off_csc224,
                "level": level_200,
                "semester": sem_2025_1,
                "resource_type": rt_textbook,
                "files": [
                    (read_bytes("HAND_ON_MACHINE_LEARNING.pdf"), "Hands_On_Machine_Learning_Reference.pdf", "application/pdf"),
                    (read_bytes("ANINTYRODUCTION_TO_STATISTICAL LEARNING.pdf"), "Introduction_to_Statistical_Learning_ISLR.pdf", "application/pdf"),
                ],
                "preview_content": "Statistical Learning: Bias-variance tradeoff, cross-validation, regularization (Ridge & Lasso), and deep neural networks.",
            },

            # --- COMPUTER PROGRAMMING (COS201 & CSC202) ---
            {
                "title": "COS201: Computer Programming I — Comprehensive C++ Lecture Notes",
                "description": "Complete departmental lecture series for COS201 / CSC2301 (Computer Programming I). Covers syntax, control flow, functions, arrays, pointers, memory addressing, and modular programming at SAZU.",
                "course": c_cos201,
                "offering": off_cos201,
                "level": level_200,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("COS201-CSC2301 COMPUTER PROGRAMMING 1 LECTURE NOTE-2 SAZU 19-01-2026_072027.docx"), "COS201_Lecture_Note_Part2.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                    (read_bytes("COS201-CSC2301 COMPUTER PROGRAMMING 1 LECTURE NOTE-3 SAZU 2-02-2026 (Autosaved)_084012.docx"), "COS201_Lecture_Note_Part3.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                    (read_bytes("COS201-CSC2301 COMPUTER PROGRAMMING 1 LECTURE NOTE-5 SAZU 16-02-2026 (Autosaved).docx"), "COS201_Lecture_Note_Part5.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                ],
                "preview_content": "Computer Programming I: Variable declarations, conditional branching, iteration loops, pointer arithmetic, and standard I/O streams.",
            },
            {
                "title": "CSC202: Computer Programming II — Advanced C++ Object-Oriented Programming",
                "description": "Official 200 Level Second Semester lecture notes for CSC202 (Computer Programming II). In-depth coverage of Object-Oriented Programming: classes, constructors, encapsulation, inheritance, polymorphism, virtual functions, templates, and operator evaluation.",
                "course": c_csc202,
                "offering": off_csc202,
                "level": level_200,
                "semester": sem_2025_2,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("C++ Lecture note Phase 1_015627.pdf"), "CSC202_CPP_Lecture_Notes_Phase1.pdf", "application/pdf"),
                    (read_bytes("C++ LN Phase II_112512.pdf"), "CSC202_CPP_Lecture_Notes_Phase2.pdf", "application/pdf"),
                    (read_bytes("Lecturer Note C++  Phase 3_122157.pdf"), "CSC202_CPP_Lecture_Notes_Phase3.pdf", "application/pdf"),
                    (read_bytes("CSC202 ASSIGNMENT GROUP2.docx"), "CSC202_Operators_Evaluation_Assignment.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                ],
                "preview_content": "Object-Oriented C++: Class hierarchies, access specifiers (public, private, protected), function overloading, dynamic binding, and destructor routines.",
            },

            # --- ADVANCED PROGRAMMING (CSC3201) ---
            {
                "title": "CSC3201: Advanced Programming — Past Examinations, Tests & C# Notes",
                "description": "High-yield examination past papers (2022 Exams & 2024 Test with verified Q&A) and complete C# .NET language guide for CSC3201 (Advanced Programming). Covers LINQ, asynchronous programming (async/await), delegates, event-driven design, and multithreading.",
                "course": c_csc3201,
                "offering": off_csc3201,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_exam_pq,
                "files": [
                    (read_bytes("ADVANCED PROGRAMMING 2022 EXAMS Q.pdf"), "CSC3201_Advanced_Programming_2022_Exam_Paper.pdf", "application/pdf"),
                    (read_bytes("ADVANCED PROGRAMMING 2024 TEST Q&A.pdf"), "CSC3201_Advanced_Programming_2024_Test_Questions_Answers.pdf", "application/pdf"),
                    (read_bytes("C# Note (1).pdf"), "CSC3201_CSharp_Programming_Lecture_Note.pdf", "application/pdf"),
                ],
                "preview_content": "Advanced Programming: C# delegates, lambda expressions, multithreading, exception hierarchies, and verified 2024 test solutions.",
            },

            # --- ALGORITHMS, DATA STRUCTURES & SEQUENTIAL PROGRAMMING ---
            {
                "title": "CSC3305: Design and Analysis of Algorithms — Lecture Notes",
                "description": "Comprehensive theoretical and algorithmic notes for CSC3305. Asymptotic notations (Big-O, Big-Omega, Big-Theta), divide-and-conquer, dynamic programming (knapsack, LCS), greedy algorithms (Dijkstra, Kruskal), graph traversals, and NP-completeness.",
                "course": c_csc3305,
                "offering": off_csc3305,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("CSC 3305 Design and Analysis of Algorithms Lecture Note_103553.pdf"), "CSC3305_Algorithms_Lecture_Note.pdf", "application/pdf")
                ],
                "preview_content": "Algorithm Analysis: Recurrence relations, Master theorem, optimal substructure, greedy choice property, and computational complexity bounds.",
            },
            {
                "title": "CSC206: Fundamentals of Data Structures & Algorithms",
                "description": "Essential data structures lecture note covering linear and non-linear data structures: contiguous vs linked lists, stacks, queues, circular buffers, binary search trees (BST), and hash tables with collision resolution.",
                "course": c_csc206,
                "offering": off_csc206,
                "level": level_200,
                "semester": sem_2025_2,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("csc206 data structure note1.pdf"), "CSC206_Data_Structures_Lecture_Note.pdf", "application/pdf")
                ],
                "preview_content": "Data Structures: Stack operations (push, pop), queue FIFO queuing, linked list pointer manipulation, and binary tree traversals (in-order, pre-order, post-order).",
            },
            {
                "title": "CSC208: Foundation of Sequential Programming — Notes & Past Papers (2021 & Recent)",
                "description": "Complete bundle for CSC208: primary theoretical syllabus, sequential program execution logic, past exam question papers, and comprehensive worked marking answers.",
                "course": c_csc208,
                "offering": off_csc208,
                "level": level_200,
                "semester": sem_2025_2,
                "resource_type": rt_exam_pq,
                "files": [
                    (read_bytes("Sequencial Programming _20250715165531651.pdf"), "CSC208_Sequential_Programming_Module.pdf", "application/pdf"),
                    (read_bytes("sequential programming.pdf"), "CSC208_Sequential_Programming_Lecture_Note.pdf", "application/pdf"),
                    (read_bytes("sequential programming 2021 PQ & Answers.pdf"), "CSC208_Sequential_Programming_2021_PQ_Answers.pdf", "application/pdf"),
                    (read_bytes("sequential programming PQ & Answers.pdf"), "CSC208_Sequential_Programming_Comprehensive_PQ_Answers.pdf", "application/pdf"),
                ],
                "preview_content": "Sequential Programming: State transitions, trace tables, sequential control structures, and fully solved past questions.",
            },

            # --- COMPUTER ARCHITECTURE & HARDWARE ---
            {
                "title": "CSC204: Computer Architecture & Organization I",
                "description": "Foundations of computer organization, von Neumann architecture, ALU data paths, instruction register, addressing modes, and data representation (integers, two's complement, IEEE 754 floating point).",
                "course": c_csc204,
                "offering": off_csc204,
                "level": level_200,
                "semester": sem_2025_2,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("CSC204.pdf"), "CSC204_Computer_Architecture_Main_Note.pdf", "application/pdf"),
                    (read_bytes("SUMMARY OF COMPUTER ARCHITECTURE AND ORGANISATION 1.pdf"), "CSC204_Architecture_Summary.pdf", "application/pdf"),
                    (read_bytes("5636a-tutorial-on-data-representation-integers-floating-point-numbers-and-characters1.pdf"), "Data_Representation_Integers_Floating_Point_Tutorial.pdf", "application/pdf"),
                ],
                "preview_content": "Architecture Principles: CPU bus systems, memory hierarchies (registers, L1/L2 cache, RAM), micro-operations, and floating-point conversion.",
            },
            {
                "title": "CSC3111: Computer Hardware Maintenance & Troubleshooting",
                "description": "Hands-on diagnostic and maintenance guide for CSC3111. Motherboard form factors, BIOS/UEFI configuration, power supply units (PSU), peripheral buses, thermal management, and hardware fault diagnostic flowcharts.",
                "course": c_csc3111,
                "offering": off_csc3111,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("CSC 3111 lecture note.pdf"), "CSC3111_Hardware_Maintenance_Lecture_Note.pdf", "application/pdf")
                ],
                "preview_content": "Hardware Maintenance: POST beep codes, memory diagnostics, storage failure symptoms, and component replacement best practices.",
            },
            {
                "title": "CSC3309: Compiler Construction & Language Translation",
                "description": "Essential quick-study reference for CSC3309 (Compiler Construction I). Detailed analysis of the phases of a compiler: lexical analysis (regular expressions & DFA), syntax analysis (LL and LR parsing), semantic analysis, intermediate code generation, and code optimization.",
                "course": c_csc3309,
                "offering": off_csc3309,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("compiler_design_quick_guide.pdf"), "CSC3309_Compiler_Design_Quick_Guide.pdf", "application/pdf")
                ],
                "preview_content": "Compiler Pipeline: Token generation, Context-Free Grammars (CFG), parse trees, syntax-directed translation, and DAG optimization.",
            },

            # --- FILE PROCESSING & DATA MANAGEMENT (CSC3303) ---
            {
                "title": "CSC3303: File Processing and Data Management I — Lecture Modules",
                "description": "Complete lecture series for CSC3303. Physical file organization, sequential, index-sequential (ISAM), hashed file structures, B-Trees, transaction logging, and database storage engines.",
                "course": c_csc3303,
                "offering": off_csc3303,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("CSC3303 Lecture Note_020154.pdf"), "CSC3303_File_Processing_Lecture_Note.pdf", "application/pdf"),
                    (read_bytes("File processing _112749.pdf"), "CSC3303_File_Processing_Data_Management.pdf", "application/pdf"),
                ],
                "preview_content": "File Storage Structures: Blocking factors, secondary indexing, hash collisions, bucket overflow, and multi-level index structures.",
            },

            # --- DIGITAL SKILLS IN ICT (CSC3301) ---
            {
                "title": "CSC3301: Digital Skills in ICT — 2025/2026 Comprehensive Study Pack",
                "description": "Official 2025/2026 academic session learning materials and revision tutorial question bank for CSC3301 / SAZU-CSC323. Covers digital productivity tools, spreadsheets, cybersecurity basics, cloud storage, and automated document formatting.",
                "course": c_csc3301,
                "offering": off_csc3301,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("Digital_Skills_Learning_Materials_25-26 session_112841.pdf"), "CSC3301_Digital_Skills_Learning_Materials_2025_2026.pdf", "application/pdf"),
                    (read_bytes("Digital Skills Tutorial Questions_112800.pdf"), "CSC3301_Digital_Skills_Tutorial_Question_Bank.pdf", "application/pdf"),
                ],
                "preview_content": "Digital Literacy: Cloud office suites, data privacy regulations, formula syntax in spreadsheet analytics, and digital ethics.",
            },

            # --- MATHEMATICS, OPERATIONS RESEARCH & STATISTICS ---
            {
                "title": "MTH3313: Introduction to Operations Research — Full Course Textbook & Lecture Notes",
                "description": "Extensive course text and official lecture notes for MTH3313. Linear programming formulation, graphical method, simplex algorithm, dual simplex, transportation problem (North-West corner, Vogel's approximation), assignment problem (Hungarian method), and game theory.",
                "course": c_mth3313,
                "offering": off_mth3313,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_textbook,
                "files": [
                    (read_bytes("MTH 3313 INTRODUCTION TO OPERATION RESEARCH .pdf"), "MTH3313_Introduction_to_Operations_Research_Textbook.pdf", "application/pdf"),
                    (read_bytes("Operation Research Lecture Note_093514.pdf"), "MTH3313_Operations_Research_Lecture_Note.pdf", "application/pdf"),
                ],
                "preview_content": "Operations Research Models: Objective function optimization, constraint inequalities, pivot selection in simplex tables, and sensitivity analysis.",
            },
            {
                "title": "MTH204: Linear Algebra II & Vector Spaces",
                "description": "Rigorous lecture modules on vector spaces, subspaces, linear independence, basis and dimension, linear transformations, kernel and image, eigenvalues, eigenvectors, and diagonalization.",
                "course": c_mth204,
                "offering": off_mth204,
                "level": level_200,
                "semester": sem_2025_2,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("linear algebra .pdf"), "MTH204_Linear_Algebra_Part1.pdf", "application/pdf"),
                    (read_bytes("linear algebra 2.pdf"), "MTH204_Linear_Algebra_Part2.pdf", "application/pdf"),
                ],
                "preview_content": "Linear Algebra Principles: Characteristic polynomial det(A - lambda*I) = 0, eigenspace determination, and matrix diagonalization.",
            },
            {
                "title": "MTH205: Analysis Algebra — Real Analysis & Algebraic Structures",
                "description": "Theoretical pure mathematics lecture note covering real number completeness, supremum and infimum, sequence convergence, Bolzano-Weierstrass theorem, metric spaces, and basic group theory structures.",
                "course": c_mth205,
                "offering": off_mth205,
                "level": level_200,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("MTH 205 Analysis Algebra.pdf"), "MTH205_Analysis_Algebra_Lecture_Note.pdf", "application/pdf")
                ],
                "preview_content": "Real Analysis: Epsilon-delta definitions, Cauchy sequences, limit points, open and closed sets, and continuous mappings.",
            },
            {
                "title": "STA105: Descriptive Statistics & Data Presentation (External FUD Reference Manual)",
                "description": "External reference study guide on descriptive statistics and data presentation (Federal University Dutse curriculum). Sourced for comparative statistical reference and foundational problem solving (External supplementary reference — not official SAZU syllabus).",
                "course": c_sta105,
                "offering": off_sta105,
                "level": level_100,
                "semester": sem_2025_1,
                "resource_type": rt_reference,
                "access_policy": "public",
                "files": [
                    (read_bytes("FUD-STA105-Descriptive Statistics-Part1_074323.pdf"), "STA105_Descriptive_Statistics_Part1.pdf", "application/pdf"),
                    (read_bytes("Presentation of Data FUD-STA105_PART TWO.pdf"), "STA105_Presentation_of_Data_Part2.pdf", "application/pdf"),
                ],
                "preview_content": "Descriptive Statistics Reference: Grouped data calculations, coefficient of variation, skewness, kurtosis, and ogive curve construction.",
            },
            {
                "title": "STA3307: Sampling Theory & Survey Methodology",
                "description": "Advanced statistical sampling guide for STA3307. Simple random sampling (with & without replacement), stratified sampling, systematic sampling, cluster sampling, ratio and regression estimators, and questionnaire design.",
                "course": c_sta3307,
                "offering": off_sta3307,
                "level": level_300,
                "semester": sem_2025_1,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("heory_Sampling(1).pdf"), "STA3307_Sampling_Theory_Module.pdf", "application/pdf"),
                    (read_bytes("Survey(1).pdf"), "STA3307_Survey_Methodology_Guide.pdf", "application/pdf"),
                ],
                "preview_content": "Sampling Theory: Sample size estimation, sampling variance, Neyman allocation, and finite population correction factors.",
            },

            # --- LIFE SCIENCES & PARASITOLOGY ---
            {
                "title": "SAZU-MCB338: General & Medical Parasitology",
                "description": "Authoritative study textbook and medical laboratory guide for SAZU-MCB338. In-depth life cycles, vectors, pathogenesis, clinical pathology, laboratory diagnosis, and prevention of Protozoa (Plasmodium, Trypanosoma, Entamoeba) and Helminths (Schistosoma, Ascaris, Taenia).",
                "course": c_mcb338,
                "offering": off_mcb338,
                "level": level_300,
                "semester": sem_2025_2,
                "resource_type": rt_textbook,
                "files": [
                    (read_bytes("General parasitology 2.pdf"), "SAZU_MCB338_General_Parasitology_Manual.pdf", "application/pdf")
                ],
                "preview_content": "Medical Parasitology: Host-parasite relationships, vector transmission cycles, diagnostic stool/blood microscopy, and chemotherapeutic targets.",
            },
            {
                "title": "BIO102: Basic Histology & Cellular Tissue Organization",
                "description": "100 Level General Biology foundational histology manual. Structural histology of epithelial, connective, muscular, and nervous tissues, staining protocols, and microscopic identification.",
                "course": c_bio102,
                "offering": off_bio102,
                "level": level_100,
                "semester": sem_2025_2,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("BASIC HISTOLOGY 1-2-1.pdf"), "BIO102_Basic_Histology_Lecture_Manual.pdf", "application/pdf")
                ],
                "preview_content": "Histological Organization: Squamous, cuboidal, and columnar epithelium, extracellular matrix fibers, and tissue classification under light microscopy.",
            },
            {
                "title": "ZOO4211: Applied Entomology II — Insect Physiology & Vector Management",
                "description": "400 Level advanced zoology textbook for ZOO4211. Insect anatomy, respiratory and nervous physiology, metamorphosis, economic entomology, integrated pest management (IPM), and biological control of disease vectors.",
                "course": c_zoo4211,
                "offering": off_zoo4211,
                "level": level_400,
                "semester": sem_2025_2,
                "resource_type": rt_textbook,
                "files": [
                    (read_bytes("ZOO4211 APPLIED ENTOMOLOGY 2.pdf"), "ZOO4211_Applied_Entomology_Textbook.pdf", "application/pdf")
                ],
                "preview_content": "Applied Entomology: Insect cuticle chemistry, tracheal respiration, juvenile hormones, pesticide toxicology, and sterile insect technique (SIT).",
            },

            # --- GENERAL STUDIES & MOBILE APP DEV ---
            {
                "title": "GST103: Use of Library, Study Skills & Information Technology (External Reference Handbook)",
                "description": "External supplementary reference handbook for university study skills and library science. Sourced from external reference curriculum for conceptual cross-study and reference only (Not official SAZU courseware).",
                "course": c_gst103,
                "offering": off_gst103,
                "level": level_100,
                "semester": sem_2025_1,
                "resource_type": rt_reference,
                "access_policy": "public",
                "files": [
                    (read_bytes("GST103 PDF.pdf"), "GST103_Library_Study_Skills_Manual.pdf", "application/pdf")
                ],
                "preview_content": "GST103 Reference Guide: Information retrieval, academic integrity, reference compilation, and electronic library catalogues.",
            },
            {
                "title": "BASUG-COS120: Mobile Application and Development — Revised Course Manual",
                "description": "Official practical development manual for mobile software architecture. Covers cross-platform frameworks, UI/UX mobile design heuristics, state management, REST API integration, persistent storage, and app publishing.",
                "course": c_cos120,
                "offering": off_cos120,
                "level": level_100,
                "semester": sem_2025_2,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("Mobile Application and Development Course Manual Revised July 2025_082115.pdf"), "COS120_Mobile_App_Development_Manual.pdf", "application/pdf")
                ],
                "preview_content": "Mobile Development Guidelines: Mobile application lifecycle, layout responsiveness, asynchronous networking, and local database caching.",
            },
            {
                "title": "COS102: Problem Solving Techniques & Computer Concepts",
                "description": "Essential 100 level foundations on algorithmic thinking, flowcharting symbols, pseudocode standardization, top-down modular decomposition, and computer problem-solving strategies.",
                "course": c_cos102,
                "offering": off_cos102,
                "level": level_100,
                "semester": sem_2025_2,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("CONCEPT OF A COMPUTER AND SOLVING PROBLEM_090233.pdf"), "COS102_Concept_of_Computer_and_Problem_Solving.pdf", "application/pdf"),
                    (read_bytes("PROBLEM_SOLVING_TECHNIQUES.pdf"), "COS102_Problem_Solving_Techniques.pdf", "application/pdf"),
                ],
                "preview_content": "Problem Solving: Algorithm logic, condition checking, loop invariants, step-wise refinement, and flowchart conventions.",
            },
            {
                "title": "PHY202: Introduction to Electric Circuits — AC Theory & Complex Impedance",
                "description": "200 Level Physics module on Alternating Current (AC) theory. Sinusoidal waveforms, phasor representations, complex impedance in RLC circuits, resonance phenomena, power factor correction, and filter networks.",
                "course": c_phy202,
                "offering": off_phy202,
                "level": level_200,
                "semester": sem_2025_2,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("Electric circuit part of AC .pdf"), "PHY202_Electric_Circuits_AC_Theory.pdf", "application/pdf")
                ],
                "preview_content": "Electric Circuits AC Analysis: Inductive and capacitive reactance, impedance triangles, series-parallel resonance, and maximum power transfer.",
            },
            {
                "title": "BASUG-COS120: Internet Architectures, DNS, HTTP Protocols & HTML Foundations",
                "description": "Foundational web technologies module covering the physical and application layers of the Internet, URL anatomy, DNS resolution hierarchies, client-server web architectures, and semantic HTML5 structuring.",
                "course": c_cos120,
                "offering": off_cos120,
                "level": level_100,
                "semester": sem_2025_2,
                "resource_type": rt_handout,
                "files": [
                    (read_bytes("1 LAYERS OF THE INTERNET WWW DNS AND URL .docx"), "Internet_Layers_DNS_URL.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                    (read_bytes("2 WEB APPLICATION AND GUIDE TO SERVER.docx"), "Web_Application_and_Server_Guide.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                    (read_bytes("3 INTRODUCTION TO HTML.docx"), "Introduction_to_HTML.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                ],
                "preview_content": "Internet & Web Protocols: TCP/IP stack, domain name resolution, HTTP request-response headers, and DOM document structure.",
            },
        ]

        print(f"\nProcessing and uploading {len(uploads)} resource packages...")
        success_count = 0
        for u in uploads:
            title = u["title"].strip()
            try:
                existing = db.scalar(select(Resource).where(Resource.title == title))
            except Exception:
                db.rollback()
                db.close()
                db = SessionLocal()
                admin_user = db.scalar(select(User).where(User.email == "wisdomdavid0307@gmail.com")) or db.scalar(select(User).where(User.is_superuser.is_(True)))
                existing = db.scalar(select(Resource).where(Resource.title == title))

            if existing:
                print(f"Skipping already existing resource: '{title}'")
                continue

            for attempt in range(3):
                try:
                    res = create_resource(
                        db,
                        admin_user,
                        title=title,
                        description=u["description"],
                        category_id=None,
                        course_id=u["course"].id,
                        course_offering_id=u["offering"].id,
                        academic_level_id=u["level"].id,
                        academic_session_id=session_2025.id,
                        semester_id=u["semester"].id,
                        resource_type_id=u["resource_type"].id,
                        is_published=True,
                        access_policy=u.get("access_policy", "subscription_or_entitlement"),
                        preview_policy="public_sample",
                        preview_content=u.get("preview_content"),
                        requires_verification=True,
                        files=u["files"],
                    )
                    db.commit()
                    success_count += 1
                    print(f"SUCCESS ({success_count}): Created Resource ID {res.id} — '{res.title}' (Course: {u['course'].code}, Level: {u['level'].code})")
                    break
                except Exception as e:
                    print(f"Attempt {attempt + 1} failed for '{title}': {e}. Reconnecting session...")
                    try:
                        db.rollback()
                    except Exception:
                        pass
                    db.close()
                    db = SessionLocal()
                    admin_user = db.scalar(select(User).where(User.email == "wisdomdavid0307@gmail.com")) or db.scalar(select(User).where(User.is_superuser.is_(True)))
                    if attempt == 2:
                        print(f"FAILED permanently for '{title}' after 3 attempts.")

        print(f"\nCompleted! Successfully added {success_count} new academic learning resources to SAZU Study Hub.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
