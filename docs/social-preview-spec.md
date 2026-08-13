# GTM Skills social preview

Use this specification for the GitHub repository social preview so the shared card matches the README landing page.

## Canvas

- Size: `1280 × 640 px`
- Safe area: keep essential copy inside the centered `1120 × 520 px`
- Background: `#f6f8fa`
- Export: PNG or JPG under GitHub’s upload limit

## Composition

1. Place a dark terminal panel in the center, using `#0d1117` with a `#30363d` border and rounded corners.
2. Add the eyebrow `GTM SKILLS` in small uppercase type.
3. Set the headline to `Open source skills for shared GTM workspace`.
4. Add the supporting line `Organize · Define ICPs · Define Personas`.
5. Show a compact success state for `GTM workspace ready`, echoing [`assets/gtm-skills-flow.svg`](../assets/gtm-skills-flow.svg).
6. Use `#2ea44f` for the primary accent and keep all text readable at feed-card size.

## Accessibility

Recommended alt text:

> GTM Skills: three open source skills for shared organization context, ideal customer profiles, and buyer personas.

Check the final image at both full size and approximately `400 px` wide. The headline and product name should remain readable without zooming.

## GitHub repository metadata

Recommended About description:

> Three open source skills for GTM workspace, ideal customer profiles, and buyer personas.

Recommended topics:

`agent-skills`, `ai-agents`, `gtm`, `sales`, `marketing`, `revops`, `customer-success`, `partnerships`

After review and approval, the description and topics can be applied with:

```sh
gh repo edit eliasstravik/gtm-skills \
  --description "Three open source skills for GTM workspace, ideal customer profiles, and buyer personas." \
  --add-topic agent-skills \
  --add-topic ai-agents \
  --add-topic gtm \
  --add-topic sales \
  --add-topic marketing \
  --add-topic revops \
  --add-topic customer-success \
  --add-topic partnerships
```

Upload the exported social image in GitHub under **Settings → General → Social preview**.
