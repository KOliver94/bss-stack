import { createFileRoute, redirect } from '@tanstack/react-router'

// Legacy URL: /video-category/<slug> permanently redirects to /events/<slug>.
export const Route = createFileRoute('/video-category/$slug')({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/events/$slug',
      params: { slug: params.slug },
      search,
      statusCode: 301,
      replace: true,
    })
  },
})
