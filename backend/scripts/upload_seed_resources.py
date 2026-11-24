"""
Script to:
1. Seed canonical ResourceTypes in database.
2. Ensure courses and offerings exist for all uploaded past questions:
   - ICT305 (Data Communication and System Networks, 300L)
   - CSC3313 (Operating System II, 300L)
   - CSC3301 (Digital Skills in ICT, 300L)
   - MTH201 (Mathematical Method I, 200L)
   - STA3307 (Sampling Theory & Survey Methods, 300L)
   - NSC104 (History of Nursing and Perspective, 100L)
   - PHY206 (Energy and Power Systems, 200L)
   - CHM102 (General Chemistry II, 100L)
   - BCH202 (General Biochemistry II, 200L)
3. Upload each resource with its proper associations (course, code, level, session, semester, department, and resource type).
"""
import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.database import SessionLocal
from app.models.academic import (
    Faculty,
    Department,
    Programme,
    Course,
    CourseOffering,
    CurriculumVersion,
    AcademicSession,
    Semester,
    AcademicLevel,
    ResourceType,
)
from app.models.user import User
from app.models.resource import Resource
from app.services.resources import create_resource
from sqlalchemy import select

def get_or_create_resource_type(db, name: str) -> ResourceType:
    rt = db.scalar(select(ResourceType).where(ResourceType.name == name))
    if not rt:
        rt = ResourceType(name=name, is_active=True)
        db.add(rt)
        db.commit()
        db.refresh(rt)
        print(f"Created ResourceType: {rt.name} (id={rt.id})")
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
        # Check if a course with similar code exists
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
        print(f"Created Course: {course.code} - {course.title} (id={course.id})")
    else:
        # Ensure level and dept are properly aligned
        updated = False
        if course.academic_level_id != academic_level_id:
            course.academic_level_id = academic_level_id
            updated = True
        if course.department_id != department_id:
            course.department_id = department_id
            updated = True
        if updated:
            db.commit()
            db.refresh(course)
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
        print(f"Created CourseOffering: course_id={course_id}, level={academic_level_id}, sem={semester_id} (id={offering.id})")
    return offering

def main():
    db = SessionLocal()
    try:
        # 1. Seed canonical ResourceTypes
        rt_handout = get_or_create_resource_type(db, "Lecture Handout / Notes")
        rt_test_pq = get_or_create_resource_type(db, "Test Past Question (C.A.)")
        rt_exam_pq = get_or_create_resource_type(db, "Exam Past Question")
        rt_solution = get_or_create_resource_type(db, "Solution & Marking Guide")
        rt_textbook = get_or_create_resource_type(db, "Textbook & Reference Material")

        # Get Admin User for attribution
        admin_user = db.scalar(select(User).where(User.email == "wisdomdavid0307@gmail.com"))
        if not admin_user:
            admin_user = db.scalar(select(User).where(User.is_superuser.is_(True)))
        print(f"Using Admin: {admin_user.full_name} ({admin_user.email})")

        # Reference Sessions & Semesters
        # Session 3 = 2025/2026, Session 2 = 2024/2025, Session 4 = 2026/2027
        # Semester 3 = 2025/2026 First Sem, Semester 6 = 2025/2026 Second Sem
        # Semester 2 = 2024/2025 Second Sem
        session_2025 = db.scalar(select(AcademicSession).where(AcademicSession.name == "2025/2026"))
        sem_2025_1 = db.scalar(select(Semester).where(Semester.academic_session_id == session_2025.id, Semester.number == 1))
        sem_2025_2 = db.scalar(select(Semester).where(Semester.academic_session_id == session_2025.id, Semester.number == 2))

        # Curriculum Versions
        # Get or create CurriculumVersion for 2025/2026
        # Find default programme e.g. Mathematical Sciences / Computer Science
        prog_cs = db.scalar(select(Programme).where(Programme.code == "BSC-COMPUTER-SCIENCE"))
        if not prog_cs:
            prog_cs = db.scalars(select(Programme)).first()

        cv_2025 = db.scalar(select(CurriculumVersion).where(CurriculumVersion.academic_session_id == session_2025.id))
        if not cv_2025:
            cv_2025 = CurriculumVersion(
                programme_id=prog_cs.id,
                academic_session_id=session_2025.id,
                version="2025/2026 Curriculum",
                is_active=True,
            )
            db.add(cv_2025)
            db.commit()
            db.refresh(cv_2025)

        # Levels
        level_100 = db.scalar(select(AcademicLevel).where(AcademicLevel.code == "100"))
        level_200 = db.scalar(select(AcademicLevel).where(AcademicLevel.code == "200"))
        level_300 = db.scalar(select(AcademicLevel).where(AcademicLevel.code == "300"))

        # Departments
        dept_math = db.scalar(select(Department).where(Department.name.ilike("%Mathematical%")))
        dept_nursing = db.scalar(select(Department).where(Department.name.ilike("%Nursing%")))
        dept_physics = db.scalar(select(Department).where(Department.name.ilike("%Physics%")))
        dept_chemistry = db.scalar(select(Department).where(Department.name.ilike("%Chemistry%")))
        dept_biochem = db.scalar(select(Department).where(Department.name.ilike("%Biochemistry%")))

        # 2. Ensure Courses & Offerings exist
        # Course 1: ICT305
        course_ict305 = get_or_create_course(db, "ICT305", "Data Communication and System Networks", dept_math.id, level_300.id, prog_cs.id)
        off_ict305 = get_or_create_offering(db, course_ict305.id, cv_2025.id, level_300.id, sem_2025_1.id, credit_units=3)

        # Course 2: CSC3313
        course_csc3313 = get_or_create_course(db, "CSC3313", "Operating System II", dept_math.id, level_300.id, prog_cs.id)
        off_csc3313 = get_or_create_offering(db, course_csc3313.id, cv_2025.id, level_300.id, sem_2025_1.id, credit_units=3)

        # Course 3: CSC3301
        course_csc3301 = get_or_create_course(db, "CSC3301", "Digital Skills in ICT", dept_math.id, level_300.id, prog_cs.id)
        off_csc3301 = get_or_create_offering(db, course_csc3301.id, cv_2025.id, level_300.id, sem_2025_1.id, credit_units=3)

        # Course 4: MTH201
        course_mth201 = get_or_create_course(db, "MTH201", "Mathematical Method I", dept_math.id, level_200.id, prog_cs.id)
        off_mth201 = get_or_create_offering(db, course_mth201.id, cv_2025.id, level_200.id, sem_2025_1.id, credit_units=3)

        # Course 5: STA3307
        course_sta3307 = get_or_create_course(db, "STA3307", "Sampling Theory & Survey Methods", dept_math.id, level_300.id, prog_cs.id)
        off_sta3307 = get_or_create_offering(db, course_sta3307.id, cv_2025.id, level_300.id, sem_2025_1.id, credit_units=3)

        # Course 6: NSC104
        prog_nursing = db.scalar(select(Programme).where(Programme.name.ilike("%Nursing%")))
        prog_nursing_id = prog_nursing.id if prog_nursing else prog_cs.id
        course_nsc104 = get_or_create_course(db, "NSC104", "History of Nursing and Perspective", dept_nursing.id, level_100.id, prog_nursing_id)
        off_nsc104 = get_or_create_offering(db, course_nsc104.id, cv_2025.id, level_100.id, sem_2025_1.id, credit_units=2)

        # Course 7: PHY206
        prog_physics = db.scalar(select(Programme).where(Programme.name.ilike("%Physics%")))
        prog_phys_id = prog_physics.id if prog_physics else prog_cs.id
        course_phy206 = get_or_create_course(db, "PHY206", "Energy and Power Systems", dept_physics.id, level_200.id, prog_phys_id)
        off_phy206 = get_or_create_offering(db, course_phy206.id, cv_2025.id, level_200.id, sem_2025_2.id, credit_units=2)

        # Course 8: CHM102
        prog_chem = db.scalar(select(Programme).where(Programme.name.ilike("%Chemistry%")))
        prog_chem_id = prog_chem.id if prog_chem else prog_cs.id
        course_chm102 = get_or_create_course(db, "CHM102", "General Chemistry II", dept_chemistry.id, level_100.id, prog_chem_id)
        off_chm102 = get_or_create_offering(db, course_chm102.id, cv_2025.id, level_100.id, sem_2025_2.id, credit_units=3)

        # Course 9: BCH202
        prog_bch = db.scalar(select(Programme).where(Programme.name.ilike("%Biochemistry%")))
        prog_bch_id = prog_bch.id if prog_bch else prog_cs.id
        course_bch202 = get_or_create_course(db, "BCH202", "General Biochemistry II", dept_biochem.id, level_200.id, prog_bch_id)
        off_bch202 = get_or_create_offering(db, course_bch202.id, cv_2025.id, level_200.id, sem_2025_2.id, credit_units=3)

        root_dir = Path(__file__).resolve().parent.parent.parent
        res_dir = root_dir / "resources"

        # Helper to read file bytes
        def read_bytes(filename: str) -> bytes:
            p = res_dir / filename
            return p.read_bytes()

        # Definitions of resources to upload
        resources_to_upload = [
            {
                "title": "ICT305: Data Communication & System Networks — 2025/2026 Examination",
                "description": "First Semester 2025/2026 Examination paper for ICT305 (Department of Mathematical Sciences). Covers OSI model layers, subnet calculations, network/internetworking devices, and CLI router configuration.",
                "course_id": course_ict305.id,
                "course_offering_id": off_ict305.id,
                "academic_level_id": level_300.id,
                "academic_session_id": session_2025.id,
                "semester_id": sem_2025_1.id,
                "resource_type_id": rt_exam_pq.id,
                "files": [
                    (read_bytes("ICT305_Data_Communication_Exam_clean (1).pdf"), "ICT305_Data_Communication_Exam_clean.pdf", "application/pdf")
                ],
                "preview_policy": "public_sample",
                "preview_content": "Faculty of Sciences: OSI Model Layers, Subnet 10.10.10.0/24 calculation, CSMA-CD, MAC sublayer, and router IP interface configuration.",
            },
            {
                "title": "CSC3313: Operating System II — C.A. Test 2025/2026",
                "description": "Continuous Assessment Test 2025/2026 for CSC3313 (Operating System II). Questions on CPU process scheduling (FCFS, SJF, Round Robin), Banker's algorithm safe sequence calculation, page replacement algorithms, and disk scheduling.",
                "course_id": course_csc3313.id,
                "course_offering_id": off_csc3313.id,
                "academic_level_id": level_300.id,
                "academic_session_id": session_2025.id,
                "semester_id": sem_2025_1.id,
                "resource_type_id": rt_test_pq.id,
                "files": [
                    (read_bytes("WhatsApp Image 2026-10-31 at 12.49.08 PM.jpeg"), "CSC3313_CA_Test_2025_2026_Clean.jpeg", "image/jpeg"),
                    (read_bytes("WhatsApp Image 2026-10-31 at 12.17.29 PM.jpeg"), "CSC3313_CA_Test_2025_2026_Original.jpeg", "image/jpeg"),
                ],
                "preview_policy": "public_sample",
                "preview_content": "Operating System II: CPU burst time scheduling (quantum=10ms), Banker's algorithm matrix, FIFO/LRU/Optimal page replacement, and SCAN disk head.",
            },
            {
                "title": "CSC3301: Digital Skills in ICT — 2025/2026 Examination (Paper A)",
                "description": "First Semester 2025/2026 Examination (Type A) for CSC3301 / SAZU-CSC323 (Digital Skills in ICT). Topics include digital workspace ecosystems, professional email etiquette and BCC, data analysis charts, 2FA, CMS platforms, and graphic design rules.",
                "course_id": course_csc3301.id,
                "course_offering_id": off_csc3301.id,
                "academic_level_id": level_300.id,
                "academic_session_id": session_2025.id,
                "semester_id": sem_2025_1.id,
                "resource_type_id": rt_exam_pq.id,
                "files": [
                    (read_bytes("WhatsApp Image 2026-10-31 at 12.54.36 PM.jpeg"), "CSC3301_Digital_Skills_Exam_PaperA_Clean.jpeg", "image/jpeg"),
                    (read_bytes("WhatsApp Image 2026-10-31 at 12.17.30 PM.jpeg"), "CSC3301_Digital_Skills_Exam_PaperA_Original.jpeg", "image/jpeg"),
                ],
                "preview_policy": "public_sample",
                "preview_content": "Digital Skills in ICT: Digital workspace tools, professional email components, chart selections for data trends, 2FA, password managers, and AI instant builders.",
            },
            {
                "title": "CSC3301: Digital Skills in ICT — 2025/2026 Examination (Paper B)",
                "description": "First Semester 2025/2026 Examination (Type B) for CSC3301 (Digital Skills in ICT). Focuses on cyber hygiene, phishing email signs, password strength principles, word processor Table of Contents automation, and CMS systems.",
                "course_id": course_csc3301.id,
                "course_offering_id": off_csc3301.id,
                "academic_level_id": level_300.id,
                "academic_session_id": session_2025.id,
                "semester_id": sem_2025_1.id,
                "resource_type_id": rt_exam_pq.id,
                "files": [
                    (read_bytes("WhatsApp Image 2026-10-31 at 12.49.08 PM (3).jpeg"), "CSC3301_Digital_Skills_Exam_PaperB_Clean.jpeg", "image/jpeg"),
                    (read_bytes("WhatsApp Image 2026-10-31 at 12.17.30 PM (2).jpeg"), "CSC3301_Digital_Skills_Exam_PaperB_Original.jpeg", "image/jpeg"),
                ],
                "preview_policy": "public_sample",
                "preview_content": "Digital Skills in ICT Type B: 2FA definition, phishing detection signs, secure browser lock indicator, and Rule of Thirds in design.",
            },
            {
                "title": "MTH201: Mathematical Method I — 200L Examination (2025/2026)",
                "description": "200 Level First Semester 2025/2026 Examination for MTH201 / MTH2301 (Mathematical Method I). Multi-variable calculus, Euler theorem, Taylor and Maclaurin series expansions, Jacobian transformations, Rolle's theorem, and Lagrange's multipliers.",
                "course_id": course_mth201.id,
                "course_offering_id": off_mth201.id,
                "academic_level_id": level_200.id,
                "academic_session_id": session_2025.id,
                "semester_id": sem_2025_1.id,
                "resource_type_id": rt_exam_pq.id,
                "files": [
                    (read_bytes("WhatsApp Image 2026-10-31 at 12.49.08 PM (1).jpeg"), "MTH201_Mathematical_Method_I_Exam_Clean.jpeg", "image/jpeg"),
                    (read_bytes("WhatsApp Image 2026-10-31 at 12.17.30 PM (1).jpeg"), "MTH201_Mathematical_Method_I_Exam_Original.jpeg", "image/jpeg"),
                ],
                "preview_policy": "public_sample",
                "preview_content": "Mathematical Method I: Partial differential equations, Taylor expansion around (x-1, y+2), Jacobian of (x,y,z) wrt (u,v,w), Rolle's theorem on [0, pi], and Lagrange multipliers.",
            },
            {
                "title": "STA3307: Sampling Theory & Survey Methods — 300L Examination (2025/2026)",
                "description": "300 Level First Semester 2025/2026 Examination for STA3307 (Sampling Theory & Survey Methods). In-depth problems on stratified sampling with proportional allocation, cluster sampling, systematic sampling interval calculation, SRSWR/SRSWOR, and selection bias.",
                "course_id": course_sta3307.id,
                "course_offering_id": off_sta3307.id,
                "academic_level_id": level_300.id,
                "academic_session_id": session_2025.id,
                "semester_id": sem_2025_1.id,
                "resource_type_id": rt_exam_pq.id,
                "files": [
                    (read_bytes("WhatsApp Image 2026-10-31 at 12.49.08 PM (2).jpeg"), "STA3307_Sampling_Theory_Exam_Clean.jpeg", "image/jpeg"),
                    (read_bytes("WhatsApp Image 2026-10-31 at 12.17.31 PM.jpeg"), "STA3307_Sampling_Theory_Exam_Original.jpeg", "image/jpeg"),
                ],
                "preview_policy": "public_sample",
                "preview_content": "Sampling Theory: Stratified random sampling proportional allocation (N=1000, n=100), systematic sampling (N=2400, n=80), SRSWOR sample space {A,B,C,D,E}, and sampling frames.",
            },
            {
                "title": "NSC104: History of Nursing and Perspective — 100L Examination",
                "description": "100 Level Examination for NSC104 (Department of Nursing, Faculty of Basic Medical Sciences). Topics: ancient roots of nursing, early civilizations, polyvalent nurse responsibilities, attributes of a professional nurse, and components of effective therapeutic communication.",
                "course_id": course_nsc104.id,
                "course_offering_id": off_nsc104.id,
                "academic_level_id": level_100.id,
                "academic_session_id": session_2025.id,
                "semester_id": sem_2025_1.id,
                "resource_type_id": rt_exam_pq.id,
                "files": [
                    (read_bytes("WhatsApp Image 2026-10-31 at 3.58.29 PM.jpeg"), "NSC104_History_of_Nursing_Exam.jpeg", "image/jpeg")
                ],
                "preview_policy": "public_sample",
                "preview_content": "History of Nursing: Ancient roots (Egypt, Greece, Rome, Medieval times), 8 polyvalent nurse roles, 10 key characteristics of a good nurse, and communication process breakdown.",
            },
            {
                "title": "PHY206: Energy and Power Systems — C.A. Test",
                "description": "Continuous Assessment Test for PHY206 (Department of Physics, Faculty of Science). Comprehensive questions on energy units, renewable vs non-renewable sources, natural gas thermal power plant efficiency, turbine power generation, and hydroelectric dam calculations.",
                "course_id": course_phy206.id,
                "course_offering_id": off_phy206.id,
                "academic_level_id": level_200.id,
                "academic_session_id": session_2025.id,
                "semester_id": sem_2025_2.id,
                "resource_type_id": rt_test_pq.id,
                "files": [
                    (read_bytes("WhatsApp Image 2026-10-31 at 3.58.29 PM (1).jpeg"), "PHY206_Energy_Power_Systems_Test.jpeg", "image/jpeg")
                ],
                "preview_policy": "public_sample",
                "preview_content": "Energy & Power Systems: 400 MW thermal power plant consumption, town deficit calculation, hydroelectric dam flow rate (Q=50 m3/s, h=80m, eta=85%), and geothermal systems.",
            },
            {
                "title": "CHM102: General Chemistry II (Stream II) — C.A. Test Question Paper",
                "description": "100 Level Second Semester C.A. Test paper for CHM102 (Stream II). Covers carbon tetravalency discoveries, vital force theory, aspirin synthesis, fullerenes, Group IA & IVA periodic trends, and IUPAC nomenclature.",
                "course_id": course_chm102.id,
                "course_offering_id": off_chm102.id,
                "academic_level_id": level_100.id,
                "academic_session_id": session_2025.id,
                "semester_id": sem_2025_2.id,
                "resource_type_id": rt_test_pq.id,
                "files": [
                    (read_bytes("WhatsApp Image 2026-10-31 at 10.00.00 PM.jpeg"), "CHM102_General_Chemistry_II_Test_Paper.jpeg", "image/jpeg")
                ],
                "preview_policy": "public_sample",
                "preview_content": "General Chemistry II: Structural carbon theory (Couper & Kekule), fullerene allotropes, Group IA reactivity, carbonyl oxidation products, and IUPAC naming.",
            },
            {
                "title": "CHM102: General Chemistry II (Stream II) — Questions with Verified Solutions & Marking Guide",
                "description": "Complete question-by-question verified solutions, answers, and chemical equations for the CHM102 Stream II Continuous Assessment Test. High-yield revision guide for 100 level students.",
                "course_id": course_chm102.id,
                "course_offering_id": off_chm102.id,
                "academic_level_id": level_100.id,
                "academic_session_id": session_2025.id,
                "semester_id": sem_2025_2.id,
                "resource_type_id": rt_solution.id,
                "files": [
                    (read_bytes("WhatsApp Image 2026-10-31 at 10.00.00 PM (1).jpeg"), "CHM102_Test_Questions_with_Answers.jpeg", "image/jpeg")
                ],
                "preview_policy": "public_sample",
                "preview_content": "Verified CHM102 Solutions: 1. Archibald Couper & August Kekule; 2. Vital force; 3. Aspirin; 4. Single and double bonds; 15. Butanoic acid; 17. 2-Methylbutane.",
            },
            {
                "title": "BCH202: General Biochemistry II — Examination Questions (Section B: Metabolism)",
                "description": "200 Level Examination Section B questions for BCH202 (General Biochemistry II). Rigorous questions on protein and carbohydrate digestion, ATP synthesis, enzyme classes, glycolysis, glycogenolysis, HMP shunt, and hormonal regulation.",
                "course_id": course_bch202.id,
                "course_offering_id": off_bch202.id,
                "academic_level_id": level_200.id,
                "academic_session_id": session_2025.id,
                "semester_id": sem_2025_2.id,
                "resource_type_id": rt_exam_pq.id,
                "files": [
                    (read_bytes("WhatsApp Image 2026-10-31 at 10.00.00 PM (2).jpeg"), "BCH202_General_Biochemistry_II_Exam_SectionB.jpeg", "image/jpeg")
                ],
                "preview_policy": "public_sample",
                "preview_content": "General Biochemistry II: Protein digestion to liver mitochondria, ATP synthesis mechanisms, enzyme catalytic roles, glycolysis irreversible steps, glycogenolysis, and galactosaemia basis.",
            },
        ]

        print(f"\nUploading {len(resources_to_upload)} verified resources to Neon and storage...")
        for r_spec in resources_to_upload:
            res = create_resource(
                db,
                admin_user,
                title=r_spec["title"],
                description=r_spec["description"],
                category_id=None,
                course_id=r_spec["course_id"],
                course_offering_id=r_spec["course_offering_id"],
                academic_level_id=r_spec["academic_level_id"],
                academic_session_id=r_spec["academic_session_id"],
                semester_id=r_spec["semester_id"],
                resource_type_id=r_spec["resource_type_id"],
                is_published=True,
                access_policy="subscription_or_entitlement",
                preview_policy=r_spec.get("preview_policy", "public_sample"),
                preview_content=r_spec.get("preview_content"),
                requires_verification=True,
                files=r_spec["files"],
            )
            print(f"SUCCESS: Uploaded Resource ID {res.id}: '{res.title}' ({len(res.files)} page(s), Course ID={res.course_id}, Level={res.academic_level_id})")

        print("\nAll 11 resources successfully uploaded and published in the database!")
    finally:
        db.close()

if __name__ == "__main__":
    main()
