import { createFileRoute, redirect } from '@tanstack/react-router'

// Legacy URL: /tagok permanently redirects to /members.
export const Route = createFileRoute('/tagok')({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/members',
      search,
      statusCode: 301,
      replace: true,
    })
  },
})
