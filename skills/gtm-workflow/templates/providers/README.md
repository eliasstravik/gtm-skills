# Provider adapters

Put adapters in `providers/<name>.ts`, with one plain exported function per endpoint. Call each adapter through `provider()` inside an operator-named step and set that step's `maxRetries = 0`. List required environment variable names in the adapter header and mirror them empty in `.env.example`. Tests use fixtures under `providers/__fixtures__/` and make no paid calls. With `GTM_SANDBOX=1`, an adapter may omit its authorization header when the host brokers that header at the firewall.
