import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.database import SessionLocal
from app.models.academic import Course, AcademicLevel, Semester, AcademicSession, Department, ResourceType
from app.models.resource import Resource

res_dir = Path(__file__).resolve().parent.parent.parent / "resources"
db = SessionLocal()

existing_storage_paths = {r.storage_path for r in db.query(Resource).all()}
existing_titles = {r.title.lower() for r in db.query(Resource).all()}

print(f"Total existing resources in DB: {len(existing_titles)}")

files = sorted([f for f in res_dir.iterdir() if f.is_file()], key=lambda x: x.name.lower())
print(f"Total files in resources directory: {len(files)}")

# Check file types
by_ext = {}
for f in files:
    by_ext.setdefault(f.suffix.lower(), []).append(f.name)

print("\nFiles by extension:")
for ext, fnames in by_ext.items():
    print(f"  {ext}: {len(fnames)} files")

db.close()
