import { QueryClient } from '@tanstack/react-query'
import { isAccessError } from '#/lib/access-errors.ts'

const MAX_RETRIES = 3

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !isAccessError(error) && failureCount < MAX_RETRIES,
      },
    },
  })

  return {
    queryClient,
  }
}
export default function TanstackQueryProvider() {}
