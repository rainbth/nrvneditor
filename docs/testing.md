# Verificación y pruebas

## Capas

- **Unit**: pruebas deterministas de utilidades y lógica local (`npm test` o `npm run test:unit`).
- **Integración**: contratos reales con el servicio local de OpenCode (`npm run test:integration`). OpenCode local es opcional; cuando no está disponible, los tests quedan explícitamente anotados como SKIP.
- **E2E mock**: interfaz con bridge simulado (`npm run test:e2e`, proyecto `mock`), requiere Chromium.
- **E2E Electron real**: proyecto `electron`, que verifica el proceso y bridge real; precisa build de aplicación no-mock y Electron disponible.

## Comandos

`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e` y `npm run verify` ejecutan controles progresivos. `npm run test:coverage` produce el informe en `artifacts/coverage`.

La cobertura usa umbrales iniciales de 55% líneas, 50% funciones, 45% ramas y 55% sentencias. Son un suelo honesto para empezar a medir; se mantienen fijos y evitan regresiones mientras crece la batería. El presupuesto de bundle gzip de producción es 997551 bytes medidos frente a 1050000 bytes permitidos (aproximadamente 5.25% de headroom). El build mock añade el chunk `mock-bridge` (~11 KB), por lo que no es el que se mide. Ejecuta `npm run build:mock` o `npm run build:app` antes de `npm run check:bundle`; se puede usar `node scripts/check-bundle-size.mjs --threshold <bytes>`.

## CI

GitHub Actions ejecuta typecheck, lint, cobertura, build de producción, presupuesto y los proyectos Playwright. Instala Chromium y lanza E2E bajo Xvfb. El workflow no necesita secretos; el proyecto Electron también forma parte de `test:e2e`.

## E2E Electron local

Ejecuta `npm run build:app` y después `npx playwright test --project=electron`. El setup de E2E utiliza userData temporal y stub de diálogos para aislar el perfil y evitar interacción manual. No uses el build `build:mock` para esta verificación.
