import { Navigate, type RouteObject } from 'react-router'

import { RootLayout } from './app/RootLayout'
import { NotFoundPage } from './app/NotFoundPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { CreateProjectDialog } from './features/projects/CreateProjectDialog'
import { TaskListPage } from './features/tasks/TaskListPage'
import { CreateTaskDialog } from './features/tasks/CreateTaskDialog'
import { TaskDrawer } from './features/tasks/TaskDrawer'

/* Exported as a plain route-object array rather than built inline in main.tsx, so
   tests can mount the same tree through createMemoryRouter with an arbitrary
   initial URL. That is what makes cold deep-link entry — the §2 requirement that
   /projects/new and /projects/:id/tasks/:taskId render their background — a
   one-line test instead of a fixture.

   Route shape per §2. Overlay routes (projects/new, tasks/new, tasks/:taskId) are
   nested CHILDREN of the screen they cover, so the background renders
   structurally on cold entry rather than via a prop any call site could forget.

   'projects' and 'projects/:projectId' are declared as separate top-level routes
   rather than one nested under the other: React Router ranks a fully static path
   ('projects/new') above a dynamic segment at the same position, so a request for
   /projects/new is matched by CreateProjectDialog's route and never mistaken for
   a project whose id is literally "new". The same reasoning applies to
   'tasks/new' vs 'tasks/:taskId' under a project. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },

      {
        path: 'projects',
        element: <ProjectsPage />,
        children: [{ path: 'new', element: <CreateProjectDialog /> }],
      },

      {
        path: 'projects/:projectId',
        element: <TaskListPage />,
        children: [
          { path: 'tasks/new', element: <CreateTaskDialog /> },
          { path: 'tasks/:taskId', element: <TaskDrawer /> },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
