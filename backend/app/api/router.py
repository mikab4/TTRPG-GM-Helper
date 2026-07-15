from fastapi import APIRouter

from app.api.routes.campaigns import router as campaigns_router
from app.api.routes.compatibility import router as compatibility_router
from app.api.routes.entities import router as entities_router
from app.api.routes.health import router as health_router
from app.api.routes.owners import router as owners_router
from app.api.routes.relationship_types import router as relationship_types_router
from app.api.routes.relationships import router as relationships_router
from app.api.routes.sessions import router as sessions_router

api_router = APIRouter()
api_router.include_router(campaigns_router, tags=["campaigns"])
api_router.include_router(compatibility_router, tags=["compatibility"])
api_router.include_router(entities_router, tags=["entities"])
api_router.include_router(health_router, tags=["health"])
api_router.include_router(owners_router, tags=["owners"])
api_router.include_router(relationship_types_router, tags=["relationship-types"])
api_router.include_router(relationships_router, tags=["relationships"])
api_router.include_router(sessions_router, tags=["sessions"])
