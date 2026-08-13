import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'

/* Import order is load-bearing: tokens.css defines the values, overrides.css and
   base.css redeclare same-specificity rules from it (`:focus-visible`, `h2-h6`
   line-height) and must therefore come after it to win the cascade. */
import './styles/tokens.css'
import './styles/layout.css'
import './styles/overrides.css'
import './styles/type.css'
import './styles/base.css'

import { createAppClient } from './api'
import { AppProviders } from './AppProviders'
import { routes } from './routes'

const container = document.getElementById('root')
if (!container) {
  throw new Error('#root missing from index.html')
}

const client = createAppClient()

createRoot(container).render(
  <StrictMode>
    <AppProviders
      client={client}
      mockController={client.controller}
      resetMockData={() => client.resetData()}
    >
      <RouterProvider router={createBrowserRouter(routes)} />
    </AppProviders>
  </StrictMode>,
)
