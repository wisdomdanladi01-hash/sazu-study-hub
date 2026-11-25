from __future__ import annotations

from app.db.database import SessionLocal
from app.models.academic import AcademicLevel, AcademicSession, Semester
from app.models.commerce import AccessPackage, Payment, Entitlement
from app.models.support import StudentSupportTicket
from app.models.user import User, Role
from app.models.audit import AuditEvent
from app.models.identity import VerificationSubmission
from app.models import StudentAcademicProfile

def run():
    with SessionLocal() as db:
        print("=== 1. PURGING TEST ACCOUNTS ===")
        test_emails = ["credential@gmail.com", "student@gmail.com"]
        for email in test_emails:
            test_user = db.query(User).filter(User.email == email).first()
            if test_user:
                print(f"Purging test user: {test_user.email} (ID: {test_user.id})")
                # Remove audit events
                db.query(AuditEvent).filter(AuditEvent.actor_user_id == test_user.id).delete()
                # Remove tickets
                db.query(StudentSupportTicket).filter(StudentSupportTicket.user_id == test_user.id).delete()
                # Remove academic profile
                db.query(StudentAcademicProfile).filter(StudentAcademicProfile.user_id == test_user.id).delete()
                # Remove entitlements
                db.query(Entitlement).filter(Entitlement.user_id == test_user.id).delete()
                # Remove payments
                db.query(Payment).filter(Payment.user_id == test_user.id).delete()
                # Remove verification submissions
                db.query(VerificationSubmission).filter(VerificationSubmission.user_id == test_user.id).delete()
                db.delete(test_user)
                db.commit()
                print(f"Purged test user {email} successfully.")

        print("\n=== 2. CONFIRMING DULY REGISTERED ACCOUNTS ===")
        super_admin_role = db.query(Role).filter(Role.name == "super_admin").first()
        wisdom = db.query(User).filter(User.email == "wisdomdavid0307@gmail.com").first()
        if wisdom and super_admin_role:
            wisdom.role_id = super_admin_role.id
            wisdom.is_superuser = True
            wisdom.email_verified = True
            db.commit()
            print(f"Configured {wisdom.email} as Super Admin with role_id {super_admin_role.id}.")

        users = db.query(User).all()
        roles = {r.id: r.name for r in db.query(Role).all()}
        print(f"Remaining duly registered accounts in database ({len(users)}):")
        for u in users:
            print(f" - {u.email} ({u.full_name}) | Role: {roles.get(u.role_id, 'None')} | Admin: {u.is_superuser}")

        print("\n=== 3. CONFIGURING 6-TIER SUBSCRIPTION PACKAGES ===")
        # Get active session, semester, level
        active_session = db.query(AcademicSession).filter(AcademicSession.id == 4).first() or db.query(AcademicSession).first()
        active_semester = db.query(Semester).filter(Semester.id == 4).first() or db.query(Semester).first()
        level_200 = db.query(AcademicLevel).filter(AcademicLevel.code == "200").first() or db.query(AcademicLevel).first()
        level_100 = db.query(AcademicLevel).filter(AcademicLevel.code == "100").first() or db.query(AcademicLevel).first()

        # Update or create Tier 1: Full Session Academic Pass (₦2,000)
        p1 = db.query(AccessPackage).filter(AccessPackage.package_type == "session").first()
        if not p1:
            p1 = AccessPackage(name="Full Session Academic Pass", package_type="session")
            db.add(p1)
        p1.name = "Full Session Academic Pass"
        p1.package_type = "session"
        p1.price_minor = 200000  # ₦2,000
        p1.subscriber_price_minor = None
        p1.academic_session_id = active_session.id if active_session else None
        p1.description = "Complete 365-day access to all courses, verified past exam questions, test marking guides, and lecture handouts across both 1st and 2nd semesters."
        p1.is_active = True
        db.commit()
        print(f"Configured Tier 1 (Session Pass): ₦{p1.price_minor/100:.0f} (ID: {p1.id})")

        # Update or create Tier 2: Per Semester Study Pass (₦1,500)
        p2 = db.query(AccessPackage).filter(AccessPackage.package_type == "semester").first()
        if not p2:
            p2 = AccessPackage(name="Single Semester Study Pass", package_type="semester")
            db.add(p2)
        p2.name = "Single Semester Study Pass"
        p2.package_type = "semester"
        p2.price_minor = 150000  # ₦1,500
        p2.subscriber_price_minor = None
        p2.semester_id = active_semester.id if active_semester else None
        p2.description = "Unrestricted access to all lecture notes, continuous assessment tests, and past exam solutions for the enrolled active semester."
        p2.is_active = True
        db.commit()
        print(f"Configured Tier 2 (Semester Pass): ₦{p2.price_minor/100:.0f} (ID: {p2.id})")

        # Update or create Tier 3 & 4: Cross-Level Carryover & Advance Pass (₦1,000 for subscribers, ₦2,000 standard)
        p3 = db.query(AccessPackage).filter(AccessPackage.name == "Cross-Level Carryover & Advance Pass").first()
        if not p3:
            p3 = db.query(AccessPackage).filter(AccessPackage.package_type == "level").first()
        if not p3:
            p3 = AccessPackage(name="Cross-Level Carryover & Advance Pass", package_type="level")
            db.add(p3)
        p3.name = "Cross-Level Carryover & Advance Pass"
        p3.package_type = "level"
        p3.price_minor = 200000  # ₦2,000 standard if not subscribed
        p3.subscriber_price_minor = 100000  # ₦1,000 discounted if subscribed to current level
        p3.academic_level_id = level_200.id if level_200 else None
        p3.description = "Access all materials of a single level lower (carryovers like MTH 201) or a level higher (advance study). ₦1,000 for active subscribers; ₦2,000 standard."
        p3.is_active = True
        db.commit()
        print(f"Configured Tier 3 & 4 (Cross-Level Pass): Standard ₦{p3.price_minor/100:.0f} | Subscriber ₦{p3.subscriber_price_minor/100:.0f} (ID: {p3.id})")

        # Update or create Tier 5 & 6: Single Material Quick Pass (₦300 standard, ₦150 for subscribers)
        p4 = db.query(AccessPackage).filter(AccessPackage.name == "Single Material Quick Pass").first()
        if not p4:
            p4 = AccessPackage(name="Single Material Quick Pass", package_type="resource_package")
            db.add(p4)
        p4.name = "Single Material Quick Pass"
        p4.package_type = "resource_package"
        p4.price_minor = 30000  # ₦300 standard
        p4.subscriber_price_minor = 15000  # ₦150 for active subscribers
        p4.academic_level_id = level_100.id if level_100 else None
        p4.description = "Instant unlock for any individual study handout, past examination paper, or test marking guide without buying a semester pass. ₦150 for active subscribers; ₦300 standard."
        p4.is_active = True
        db.commit()
        print(f"Configured Tier 5 & 6 (Single Material Pass): Standard ₦{p4.price_minor/100:.0f} | Subscriber ₦{p4.subscriber_price_minor/100:.0f} (ID: {p4.id})")

        # Deactivate any duplicate or unneeded legacy packages
        all_pkgs = db.query(AccessPackage).all()
        for p in all_pkgs:
            if p.id not in (p1.id, p2.id, p3.id, p4.id):
                p.is_active = False
        db.commit()
        print("\nAll 6 tiers configured and ready for live checkout!")

if __name__ == "__main__":
    run()
