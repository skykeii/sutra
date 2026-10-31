"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false, loading: () => <p role="status" className="p-6 text-sm text-muted-foreground">Loading API documentation…</p> });

export function Swagger() {
  return <SwaggerUI url="/api/v1/openapi.json" tryItOutEnabled docExpansion="list" />;
}
