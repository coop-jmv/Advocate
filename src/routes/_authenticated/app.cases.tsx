import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/cases")({
  component: () => <Outlet />,
});
