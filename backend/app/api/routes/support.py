from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user
from app.db.database import get_db
from app.models.support import StudentSupportTicket
from app.models.user import User

router = APIRouter(prefix="/student/tickets", tags=["Student Support & Corrections"])
admin_router = APIRouter(prefix="/admin/tickets", tags=["Admin Student Tickets"])


class TicketCreate(BaseModel):
    category: str = Field(..., max_length=50)
    subject: str = Field(..., min_length=3, max_length=200)
    message: str = Field(..., min_length=10, max_length=3000)


class TicketAdminUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|under_review|resolved|rejected)$")
    admin_notes: str | None = Field(None, max_length=3000)


class TicketResponse(BaseModel):
    id: int
    user_id: int
    user_email: str | None = None
    user_name: str | None = None
    category: str
    subject: str
    message: str
    status: str
    admin_notes: str | None = None
    resolved_by_id: int | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
def create_ticket(
    body: TicketCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    ticket = StudentSupportTicket(
        user_id=current_user.id,
        category=body.category,
        subject=body.subject.strip(),
        message=body.message.strip(),
        status="pending",
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return TicketResponse(
        id=ticket.id,
        user_id=ticket.user_id,
        user_email=current_user.email,
        user_name=current_user.full_name,
        category=ticket.category,
        subject=ticket.subject,
        message=ticket.message,
        status=ticket.status,
        admin_notes=ticket.admin_notes,
        resolved_by_id=ticket.resolved_by_id,
        resolved_at=ticket.resolved_at,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
    )


@router.get("", response_model=list[TicketResponse])
def get_my_tickets(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    tickets = db.scalars(
        select(StudentSupportTicket)
        .where(StudentSupportTicket.user_id == current_user.id)
        .order_by(StudentSupportTicket.created_at.desc())
    ).all()
    return [
        TicketResponse(
            id=t.id,
            user_id=t.user_id,
            user_email=current_user.email,
            user_name=current_user.full_name,
            category=t.category,
            subject=t.subject,
            message=t.message,
            status=t.status,
            admin_notes=t.admin_notes,
            resolved_by_id=t.resolved_by_id,
            resolved_at=t.resolved_at,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in tickets
    ]


@admin_router.get("", response_model=list[TicketResponse])
def list_admin_tickets(
    admin: Annotated[User, Depends(get_current_admin)],
    db: Session = Depends(get_db),
    status_filter: str | None = Query(None, alias="status"),
):
    stmt = select(StudentSupportTicket).order_by(StudentSupportTicket.created_at.desc())
    if status_filter:
        stmt = stmt.where(StudentSupportTicket.status == status_filter)
    tickets = db.scalars(stmt).all()

    results = []
    for t in tickets:
        u = db.get(User, t.user_id)
        results.append(
            TicketResponse(
                id=t.id,
                user_id=t.user_id,
                user_email=u.email if u else None,
                user_name=u.full_name if u else None,
                category=t.category,
                subject=t.subject,
                message=t.message,
                status=t.status,
                admin_notes=t.admin_notes,
                resolved_by_id=t.resolved_by_id,
                resolved_at=t.resolved_at,
                created_at=t.created_at,
                updated_at=t.updated_at,
            )
        )
    return results


@admin_router.patch("/{ticket_id}", response_model=TicketResponse)
def update_admin_ticket(
    ticket_id: int,
    body: TicketAdminUpdate,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Session = Depends(get_db),
):
    ticket = db.get(StudentSupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    ticket.status = body.status
    if body.admin_notes is not None:
        ticket.admin_notes = body.admin_notes
    if body.status in ("resolved", "rejected"):
        ticket.resolved_by_id = admin.id
        ticket.resolved_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(ticket)

    u = db.get(User, ticket.user_id)
    return TicketResponse(
        id=ticket.id,
        user_id=ticket.user_id,
        user_email=u.email if u else None,
        user_name=u.full_name if u else None,
        category=ticket.category,
        subject=ticket.subject,
        message=ticket.message,
        status=ticket.status,
        admin_notes=ticket.admin_notes,
        resolved_by_id=ticket.resolved_by_id,
        resolved_at=ticket.resolved_at,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
    )
