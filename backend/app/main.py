import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.health import router as health_router
from app.api.routes.assessments import admin_router as assessments_admin_router
from app.api.routes.assessments import router as assessments_router
from app.api.routes.auth import admin_router as auth_admin_router
from app.api.routes.auth import router as auth_router
from app.api.routes.academic_admin import router as academic_admin_router
from app.api.routes.payments import admin_router as payments_admin_router
from app.api.routes.payments import router as payments_router
from app.api.routes.payments import webhook_router as paystack_webhook_router
from app.api.routes.resources import admin_router as resources_admin_router
from app.api.routes.resources import router as resources_router
from app.api.routes.student_portal import router as student_portal_router
from app.api.routes.support import admin_router as support_admin_router
from app.api.routes.support import router as support_router
from app.api.routes.verification import admin_router as verification_admin_router
from app.api.routes.verification import router as verification_router
from app.core.config import settings

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Backend API for the Learning Resource Platform.",
    debug=settings.debug,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?:\/\/.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled server exception: %s", exc)
    origin = request.headers.get("origin")
    headers: dict[str, str] = {}
    if origin and (origin.endswith(".vercel.app") or "localhost" in origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content=(
            {
                "detail": "An internal server error occurred.",
                "error_type": type(exc).__name__,
                "message": str(exc),
            }
            if settings.debug
            else {"detail": "An internal server error occurred."}
        ),
        headers=headers,
    )


app.include_router(health_router, prefix=settings.api_v1_str)
app.include_router(auth_router, prefix=settings.api_v1_str)
app.include_router(auth_admin_router, prefix=settings.api_v1_str)
app.include_router(student_portal_router, prefix=settings.api_v1_str)
app.include_router(academic_admin_router, prefix=settings.api_v1_str)
app.include_router(verification_router, prefix=settings.api_v1_str)
app.include_router(verification_admin_router, prefix=settings.api_v1_str)
app.include_router(resources_router, prefix=settings.api_v1_str)
app.include_router(resources_admin_router, prefix=settings.api_v1_str)
app.include_router(payments_router, prefix=settings.api_v1_str)
app.include_router(payments_admin_router, prefix=settings.api_v1_str)
app.include_router(paystack_webhook_router, prefix=settings.api_v1_str)
app.include_router(assessments_router, prefix=settings.api_v1_str)
app.include_router(assessments_admin_router, prefix=settings.api_v1_str)
app.include_router(support_router, prefix=settings.api_v1_str)
app.include_router(support_admin_router, prefix=settings.api_v1_str)


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": f"{settings.app_name} is running"}
