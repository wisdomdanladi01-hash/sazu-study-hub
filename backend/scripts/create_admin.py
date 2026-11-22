import argparse
from getpass import getpass

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select

from app.core.security import hash_password
from app.db.database import SessionLocal
from app.models.user import Role, User


def create_or_update_admin(
    email: str,
    full_name: str,
    password: str,
    is_superuser: bool = True,
    role_name: str = "super_admin",
    allow_update: bool = False,
) -> User:
    try:
        norm_email = validate_email(email, check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise SystemExit(f"Invalid email address: {exc}") from exc

    if len(password) < 12:
        raise SystemExit("Password must be at least 12 characters.")
    if not full_name.strip():
        raise SystemExit("Full name is required.")

    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.email == norm_email))
        role = db.scalar(select(Role).where(Role.name == role_name))
        if role is None and role_name != "super_admin":
            role = Role(name=role_name, description=f"Platform {role_name}")
            db.add(role)
            db.flush()

        if existing:
            if not allow_update:
                raise SystemExit(
                    f"Account with email '{norm_email}' already exists. Use --update to promote or update password."
                )
            existing.full_name = full_name.strip()
            existing.password_hash = hash_password(password)
            existing.is_active = True
            existing.is_superuser = is_superuser
            existing.email_verified = True
            if role:
                existing.role_id = role.id
            db.commit()
            db.refresh(existing)
            print(f"Successfully updated admin account for '{norm_email}' (superuser={existing.is_superuser}).")
            return existing

        user = User(
            email=norm_email,
            full_name=full_name.strip(),
            password_hash=hash_password(password),
            role_id=role.id if role else None,
            is_active=True,
            is_superuser=is_superuser,
            email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Successfully created admin account for '{norm_email}' (ID={user.id}, superuser={user.is_superuser}).")
        return user
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or promote an administrator account for SAZU Study Hub.")
    parser.add_argument("--email", "-e", help="Administrator email address")
    parser.add_argument("--name", "-n", help="Administrator full name")
    parser.add_argument("--password", "-p", help="Administrator password (min 12 characters)")
    parser.add_argument("--role", "-r", default="super_admin", help="Role name (default: super_admin)")
    parser.add_argument("--no-superuser", action="store_true", help="Do not make this account a superuser")
    parser.add_argument("--update", "-u", action="store_true", help="Update user if email already exists")

    args = parser.parse_args()

    email = args.email or input("Administrator email: ").strip()
    full_name = args.name or input("Administrator full name: ").strip()

    if args.password:
        password = args.password
    else:
        password = getpass("Password (minimum 12 characters): ")
        confirmation = getpass("Confirm password: ")
        if password != confirmation:
            raise SystemExit("Passwords do not match.")

    create_or_update_admin(
        email=email,
        full_name=full_name,
        password=password,
        is_superuser=not args.no_superuser,
        role_name=args.role,
        allow_update=args.update,
    )


if __name__ == "__main__":
    main()
