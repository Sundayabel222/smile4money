import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export function NotFound() {
  useEffect(() => {
    document.title = '404 — Page Not Found';
  }, []);

  return (
    <main
      className="dark:bg-slate-950 dark:text-slate-100 flex min-h-screen flex-col items-center justify-center bg-gray-100 px-4 text-slate-900 transition-colors"
      data-testid="not-found-page"
    >
      <div className="dark:bg-slate-800 dark:border-slate-700 w-full max-w-md rounded-2xl border border-slate-200 bg-white px-10 py-12 text-center shadow-lg">
        <p className="mb-2 text-6xl font-bold text-indigo-600 select-none" aria-hidden="true">
          404
        </p>
        <h1 className="dark:text-slate-100 mb-3 text-2xl font-semibold text-slate-900">
          Page not found
        </h1>
        <p className="dark:text-slate-400 mb-8 text-sm text-slate-500">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="inline-block rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
