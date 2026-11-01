import { MotionConfig } from "motion/react";
import { lazy, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { Layout } from "./components/Layout";
import { Button, Card, EmptyState, Skeleton } from "./components/ui";
import "./index.css";
import { StoreProvider } from "./lib/store";
import Dashboard from "./pages/Dashboard";
import Farms from "./pages/Farms";

// Heavier pages (charts, region list, speech) load on demand.
const FarmDetail = lazy(() => import("./pages/FarmDetail"));
const Advisor = lazy(() => import("./pages/Advisor"));
const NewFarm = lazy(() => import("./pages/NewFarm"));
const System = lazy(() => import("./pages/System"));

const page = (el: ReactNode) => (
  <Suspense
    fallback={
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    }
  >
    {el}
  </Suspense>
);

function NotFound() {
  return (
    <Card>
      <EmptyState
        icon={<span className="text-2xl">🌱</span>}
        title="Nothing growing here"
        body="That page doesn't exist."
        action={
          <Link to="/">
            <Button>Back to overview</Button>
          </Link>
        }
      />
    </Card>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Dashboard /> },
      { path: "/farms", element: <Farms /> },
      { path: "/farms/new", element: page(<NewFarm />) },
      { path: "/farms/:id", element: page(<FarmDetail />) },
      { path: "/advisor", element: page(<Advisor />) },
      { path: "/system", element: page(<System />) },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <RouterProvider router={router} />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "var(--surface)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: 16,
              fontFamily: "var(--font-sans)",
            },
          }}
        />
      </StoreProvider>
    </MotionConfig>
  </StrictMode>,
);
