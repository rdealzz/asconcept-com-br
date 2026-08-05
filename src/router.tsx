import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Ao passar o mouse (ou encostar o dedo) num link, o código da rota já vai
    // sendo buscado — quando o clique acontece, não há o que esperar.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
