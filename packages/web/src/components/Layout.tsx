import React from "react";
import { Link, useLocation, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/orrs", label: "ORRs" },
  { path: "/incidents", label: "Incidents" },
  { path: "/insights", label: "Insights" },
  { path: "/flags", label: "Flags" },
  { path: "/learn", label: "Learn" },
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">Resilience Companion</h1>
          <p className="text-xs text-gray-500 mt-1">ORRs & Incident Analysis</p>
        </div>

        <nav className="flex-1 p-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-3 py-2 rounded text-sm ${
                location.pathname.startsWith(item.path)
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
