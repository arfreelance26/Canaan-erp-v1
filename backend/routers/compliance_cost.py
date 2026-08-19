from decimal import Decimal, InvalidOperation
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from security import get_current_user, TokenUser

router = APIRouter(prefix="/compliance-cost", tags=["Compliance Cost Configuration"])


def _to_decimal(val: str | None) -> Decimal | None:
    if not val:
        return None
    try:
        d = Decimal(str(val).strip())
        return d if d >= 0 else None
    except InvalidOperation:
        return None


def _fmt(val) -> str:
    if val is None:
        return ""
    s = str(val)
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s


@router.get("", response_model=list[schemas.ComplianceCostConfigOut])
def get_compliance_costs(db: Session = Depends(get_db)):
    return db.query(models.ComplianceCostConfig).order_by(models.ComplianceCostConfig.tyre_layout).all()


@router.put("", response_model=list[schemas.ComplianceCostConfigOut])
def save_compliance_costs(payload: schemas.ComplianceCostBulkSave, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    if current_user.role != "Admin":
        raise HTTPException(403, "Only Admins can modify Compliance Cost Configuration.")
    for item in payload.configs:
        row = db.query(models.ComplianceCostConfig).filter_by(tyre_layout=item.tyre_layout).first()
        if row:
            row.rc_cost              = _to_decimal(item.rc_cost)
            row.fc_cost              = _to_decimal(item.fc_cost)
            row.road_tax_cost        = _to_decimal(item.road_tax_cost)
            row.national_permit_cost = _to_decimal(item.national_permit_cost)
            row.local_permit_cost    = _to_decimal(item.local_permit_cost)
            row.pollution_cert_cost  = _to_decimal(item.pollution_cert_cost)
            row.insurance_cost       = _to_decimal(item.insurance_cost)
        else:
            db.add(models.ComplianceCostConfig(
                tyre_layout           = item.tyre_layout,
                rc_cost               = _to_decimal(item.rc_cost),
                fc_cost               = _to_decimal(item.fc_cost),
                road_tax_cost         = _to_decimal(item.road_tax_cost),
                national_permit_cost  = _to_decimal(item.national_permit_cost),
                local_permit_cost     = _to_decimal(item.local_permit_cost),
                pollution_cert_cost   = _to_decimal(item.pollution_cert_cost),
                insurance_cost        = _to_decimal(item.insurance_cost),
            ))
    db.commit()
    return db.query(models.ComplianceCostConfig).order_by(models.ComplianceCostConfig.tyre_layout).all()
