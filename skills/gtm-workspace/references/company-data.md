# Company data

Thirteen fields, always in this order, one line each. `ORG.md` records sourced facts about the organization; `ICP.md` records desired or accepted criteria for target accounts, where ranges and lists of accepted values are allowed. Unresolved means `Unknown`; never invent a value; never derive an ICP criterion from organization facts.

| Field | In `ORG.md` (fact) | In `ICP.md` (criterion) |
| --- | --- | --- |
| Business types | B2B, B2C, marketplace, and the like | accepted types |
| Industries | the industries it operates in | accepted industries |
| Subindustries | narrower segments within those industries | accepted segments |
| Revenue streams | how it earns: subscriptions, services, transactions | accepted models |
| Annual revenue | amount or range, noting when estimated | accepted range |
| Company size | headcount band | accepted band |
| Company type | privately held, public, nonprofit, government | accepted types |
| Description | what the company does, in one sentence | what the accounts look like |
| Domain | primary web domain | accepted domain patterns, or `Unknown` |
| Employees | headcount, noting when estimated | accepted range |
| Location | headquarters and offices | accepted countries or regions |
| Products and services | what it sells | what the accounts sell |
| Tech stack | tools it is known to use | required or accepted tools |

Nested bullets appear only under Location, Products and services, and Tech stack, in both files. Doctor treats `Unknown` in an ICP's Description and Domain as normal.
