import { render, type RenderResult } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { AppProviders } from '../AppProviders'
import { createMockClient, type MockClient } from '../api/mock/createMockClient'
import { MockController, type MockConfig } from '../api/mock/failure'
import { routes } from '../routes'

/* Mounts the real route tree and the real provider stack at an arbitrary URL.

   Going through createMemoryRouter with the exported `routes` array — rather than
   rendering a component directly — is what makes cold deep-link entry testable:
   /projects/new must render the project list behind it (§2 line 46), and that is a
   property of the route tree, not of any component.

   Latency defaults to zero so tests are not racing a timer; the tests that care
   about the 200ms gate set it explicitly. */
export interface RenderAppResult extends RenderResult {
  client: MockClient
  router: ReturnType<typeof createMemoryRouter>
}

export function renderApp(
  url = '/',
  config: Partial<MockConfig> = {},
): RenderAppResult {
  const controller = new MockController({
    seed: 'default',
    latency: { min: 0, max: 0 },
    failures: [],
    ...config,
  })
  const client = createMockClient({ controller })
  const router = createMemoryRouter(routes, { initialEntries: [url] })

  const result = render(
    <AppProviders
      client={client}
      mockController={controller}
      resetMockData={() => client.resetData()}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  )

  return { ...result, client, router }
}
