# LinkedIn profile fields for shared People and Companies

Field research from 2026-09-15. This dictionary defines the shared storage contract; documented fields do not establish live provider coverage.

## Recommendation

Keep two shared entity tables, `people` and `companies`. Give single-value profile facts typed columns. Give each repeating profile section a structured JSON column. Keep the complete provider response alongside the normalized fields. This captures rich profiles without adding Employment, Education, Skills, or Funding tables.

One person stays one row even when they have several current jobs. Each experience can reference one company row. Company-to-people navigation reads those references. All confirmed current companies are eligible for enrichment; the run budget controls how many lookups finish. Relationships survive a deferred or failed company lookup.

“Canonical” means our consistent field names and meanings across providers. It does not mean LinkedIn publishes one universal enrichment schema. This proposal covers the documented fields found in the sources below. Unknown future fields remain available in the raw response and can be promoted to columns later. A provider's advertised full profile is not a guarantee that every section will be populated.

## Contents

- [Evidence and limits](#evidence-and-limits)
- [Shared metadata](#shared-metadata)
- [People columns](#people-columns)
- [Companies columns](#companies-columns)
- [Repeating sections](#repeating-sections)
- [Normalization rules](#normalization-rules)
- [Workflow and viewer consequences](#workflow-and-viewer-consequences)
- [Coverage audit](#coverage-audit)

## Evidence and limits

| Code | Primary source | What was verified |
| --- | --- | --- |
| H | [HarvestAPI OpenAPI](https://github.com/HarvestAPI/harvestapi-docs/blob/main/linkedin-api-reference/openapi.json) | Machine-readable Profile, Company, and nested section definitions. The specification declares an MIT license. Downloaded and inspected directly. |
| HP | [HarvestAPI person actor](https://apify.com/harvestapi/linkedin-profile-scraper) | Developer-published example of a detailed person result and separate email-search behavior. |
| HC | [HarvestAPI company actor](https://apify.com/harvestapi/linkedin-company) | Developer-published company example, including office addresses and affiliated pages. |
| BP | [Bright Data person response](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-profiles-collect-by-url) | Example includes profile sections, numeric ID, image flags, recommendations, related profiles, and activity previews. Null examples prove a named field exists, not its populated substructure. |
| BC | [Bright Data company response](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-companies-collect-by-url) | Example includes funding, investors, stock information, affiliated pages, posts, employee previews, and location variants. |
| CP | [Clay Enrich Person](https://www.clay.com/integrations/action/enrich-person-companies-people-and-jobs), [Unified Person](https://www.clay.com/integrations/action/enrich-person-unified-only-companies-people-and-jobs) | Native actions list basic person fields. These short action pages are not exhaustive response schemas. |
| CC | [Clay Enrich Company](https://www.clay.com/integrations/action/enrich-company-companies-people-and-jobs) | Native action lists company identity, employee count and size, industry, description, type, founding data, logo, followers, ownership, and address fields. |
| D | [Dev Fusion person actor](https://apify.com/dev_fusion/linkedin-profile-scraper) | Developer-published output names for person identity, role history, company details, contacts, and additional sections. |
| O | [ContactOut API](https://api.contactout.com/#company-information-from-domains) | Company endpoint response and person endpoint elsewhere on the same reference. Includes company technologies/revenue/funding, person function/seniority, typed contacts, and provider update time. |
| M | Monid catalog, read through `monid inspect` | Confirmed metadata for Clay `/enrichment/person`, ContactOut `/v1/domain/enrich`, Apify `/dev_fusion/linkedin-profile-scraper`, and Ploid `/linkedin/profile` and `/linkedin/company`. Discovery/inspection only; no paid runs. |

Monid is the access layer here. The underlying provider determines the returned profile shape. Clay's Monid person summary lists work history, education, languages, followers, photo, and location in addition to the native action's short field list. The catalog did not contain the guessed Clay `/enrichment/company` or Apify `/harvestapi/linkedin-profile-scraper` paths. Do not assume direct-provider endpoints are available through Monid under the same names. Saved catalog responses are linked from the consultation notes. [Monid overview](https://monid.ai/blog/linkedin-profiles-emails-one-integration), [Clay-managed functions](https://developers.clay.com/routines/clay-managed-functions).

The HarvestAPI `main=true` option explicitly returns a shortened profile, including at most five experiences, two educations, and two skills. Its email search is an additional option. Use full-section coverage when available; save section completeness and actual returned fields. Neither catalog inspection nor documentation establishes real-world coverage or accuracy. [HarvestAPI request definition](https://raw.githubusercontent.com/HarvestAPI/harvestapi-docs/main/linkedin-api-reference/openapi.json).

Revenue, technologies, seniority, discovered contact details, and some funding fields may be provider enrichment rather than LinkedIn-authored facts. Preserve them when returned, with their source; do not label them verified LinkedIn facts. ContactOut's company endpoint already returns several of these. PDL explicitly describes its own revenue range as model-inferred. [ContactOut response](https://api.contactout.com/#company-information-from-domains), [PDL revenue definition](https://docs.peopledatalabs.com/docs/company-schema#inferred-revenue).

## Shared metadata

These are proposed application fields, not provider claims. Add them to both tables. The types name a field's kind; in Postgres `TEXT` is `text`, `INTEGER` `integer`, `REAL` `double precision`, `BOOL` a nullable `boolean`, `TIME` a `timestamptz` read and written as `Date`, and `JSON[]` and `JSON{}` validated `jsonb`. Provider-supplied dates that may be partial (`registered_at`, `founded_on`) stay `TEXT`. Profile columns are nullable unless noted.

| Column | Type | Meaning |
| --- | --- | --- |
| `key` | TEXT | Required stable internal identity. Never a person's name or a company-name slug. |
| `created_at` | TIME | Required UTC time when we first created this record. |
| `updated_at` | TIME | Required UTC time of the latest local record change. |
| `enriched_at` | TIME | Time of the last accepted successful profile lookup. Failed attempts do not advance it. |
| `last_attempt_at` | TIME | Time of the latest attempted lookup. |
| `enrichment_status` | TEXT | Pending, enriched, partial, no_match, ambiguous, failed, or budget_deferred. Freshness is evaluated separately. |
| `error` | TEXT | Latest safe, human-readable error; no credentials or headers. |
| `cost_usd` | REAL | Cost attributed to the latest attempt, nullable when unknown. Aggregate spend comes from run accounting, not a sum of these mutable rows. |
| identifiers | table | Not a column: `gtm.profile_identifiers (entity, namespace, value) → key, observed_at` holds every provider/platform identifier and each merged record's old key, one owner per identifier. Keep numeric and opaque LinkedIn identifiers distinct. |
| `sources_json` | JSON[] | Source/import/workflow membership, original row key, network owner/kind when supplied, connection date, first and last observation. |
| `provenance_json` | JSON{} | For each field or section: provider, endpoint, response reference/path, fetched time, provider-updated time if returned, and reported/inferred classification when known. |
| `section_status_json` | JSON{} | Per section: complete, partial, unsupported, not_requested, unknown, or failed, with returned count and provider total/cursor when available. |
| `raw_responses_json` | JSON{} | Latest retained response envelope per provider/endpoint/mode, plus the response supporting current values if a later attempt failed or was ambiguous. Includes unmapped fields. No unbounded history or secrets. |

There is no need for a field-level event store at this stage. Keep metadata alongside each profile. If a future multi-provider merge cannot be explained by the retained evidence, preserve the earlier supporting response until those values are replaced.

## People columns

These are the proposed profile columns in addition to shared metadata. Evidence codes refer to the linked primary sources above. Derived fields are explicitly marked.

### Identity, profile, location, and counts

| Column | Type | Meaning / source |
| --- | --- | --- |
| `linkedin_url` | TEXT | Canonical profile URL. H, BP, CP, D, O. |
| `linkedin_slug` | TEXT | Public URL identifier. H `publicIdentifier`, D; BP ID aliases require adapter checks. |
| `linkedin_profile_id` | TEXT | Opaque LinkedIn member/profile identifier. H `id`; never cast to a number. |
| `linkedin_numeric_id` | TEXT | Numeric platform identifier when explicitly returned. BP `linkedin_num_id`; stored as text to preserve precision. |
| `linkedin_urn` | TEXT | URN/object identity as returned. H `objectUrn`, D `urn`; retain identifier namespace. |
| `full_name` | TEXT | Provider name; join first/last only when needed and mark as derived. CP, BP, D, O. |
| `first_name` | TEXT | Given name. H, BP, D. |
| `last_name` | TEXT | Family/display surname, including suffixes as returned. H, BP, D. |
| `headline` | TEXT | Profile headline, not a substitute for a verified current job. H, D, O. |
| `about` | TEXT | Full profile summary. H `about`, O `summary`, BP `about`. |
| `industry` | TEXT | Person's reported/provider industry. O, M Ploid summary. |
| `primary_job_title` | TEXT | Provider's primary title; otherwise a derived display value only when a primary role is supported. CP, M Clay `title`, D `jobTitle`. |
| `primary_company_key` | TEXT | Derived reference from a confidently matched primary employer. Nullable for ambiguous or multiple unranked current roles. |
| `job_function` | TEXT | Provider classification. O `job_function`; do not imply LinkedIn authored it. |
| `seniority` | TEXT | Provider classification. O `seniority`; no extra AI classification implied. |
| `location_label` | TEXT | Original location display text. H `location.linkedinText`, O `location`, M Clay `location_name`. |
| `country_code` | TEXT | Country code when supplied or deterministically normalized. H, BP, CP. |
| `country` | TEXT | Country name. H parsed location, O, M Clay. |
| `region` | TEXT | State/region. H parsed location. |
| `city` | TEXT | Parsed city. H; BP `city` can contain a full location string and must not be copied blindly. |
| `location_json` | JSON{} | Full original and parsed location components, including region codes and alternate country labels. H. |
| `followers_count` | INTEGER | Follower count. H `followerCount`, BP/D/O `followers`, M Clay `num_followers`. |
| `connections_count` | INTEGER | Connection count value. H `connectionsCount`, BP/D `connections`, CP estimated network size. |
| `connections_count_kind` | TEXT | Derived interpretation: exact, lower_bound, estimate, or unknown. Preserve a displayed `500+` as a lower bound when evidenced. |
| `recommendations_count` | INTEGER | Provider-reported count, separate from number of returned recommendations. BP. |
| `profile_photo_url` | TEXT | Preferred image URL. H `profilePicture.url`/`photo`, BP `avatar`, O `profile_picture_url`, M Clay `picture_url_orig`. |
| `cover_photo_url` | TEXT | Preferred cover image. H `coverPicture.url`, BP `banner_image`. |
| `images_json` | JSON{} | All returned profile/cover image variants and dimensions. H. |
| `avatar_is_default` | BOOL | Provider says the avatar is a placeholder. BP `default_avatar`. |

### Profile flags and localization

| Column | Type | Meaning / source |
| --- | --- | --- |
| `is_open_to_work` | BOOL | Explicit profile/provider status. H `openToWork`; O `work_status` only when unambiguous. |
| `is_hiring` | BOOL | Hiring flag. H `hiring`. |
| `is_premium` | BOOL | Premium flag. H `premium`. |
| `is_influencer` | BOOL | Platform/provider influencer flag. H, BP. |
| `is_creator` | BOOL | Creator flag. H `creator`. |
| `is_verified` | BOOL | Returned verification flag, with provider meaning retained. H `verified`. |
| `is_memorialized` | BOOL | Account state when returned. H `memorialized`, BP `memorialized_account`. |
| `registered_at` | TEXT | Account registration timestamp when provided; unknown stays null. H `registeredAt`. |
| `primary_locale` | TEXT | Normalized language-country code when both components are known. H `primaryLocale`. |
| `locales_json` | JSON[] | Available profile language variants. H `profileLocales`. |
| `localized_headlines_json` | JSON[] | Locale/headline pairs. H `multiLocaleHeadline`. |
| `profile_actions_json` | JSON[] | Returned profile buttons, labels, action types, and URLs. H `profileActions`. |
| `message_option_type` | TEXT | Provider's messaging-option descriptor. H `composeOptionType`; not proof we can contact the person. |

### Profile sections and contacts

| Column | Type | Meaning / source |
| --- | --- | --- |
| `experiences_json` | JSON[] | Complete returned work history with linked company keys and current-status evidence. H, M Clay, D, O. |
| `education_json` | JSON[] | Schools, qualifications, fields, dates, and related details. H, BP, D, O. |
| `skills_json` | JSON[] | Skill names, endorsements, associated positions. H, D, O. |
| `languages_json` | JSON[] | Language and proficiency. H, M Clay, O. |
| `certifications_json` | JSON[] | Credentials, issuers, identifiers, URLs, issue/expiry dates. H, D, O. |
| `projects_json` | JSON[] | Project descriptions, dates, affiliations, contributors. H, D, O. |
| `volunteering_json` | JSON[] | Organization, role, cause, dates, description when available. H, BP, O. |
| `publications_json` | JSON[] | Titles, publishers, authors, dates, descriptions, URLs. H, D, O. |
| `patents_json` | JSON[] | Patent titles, numbers, dates, descriptions, URLs. H, BP, D. |
| `courses_json` | JSON[] | Course titles and affiliations. H, BP. |
| `honors_awards_json` | JSON[] | Awards, issuers, dates, descriptions, affiliations. H, BP. |
| `organizations_json` | JSON[] | Memberships, positions, dates, organizations. H, BP. |
| `recommendations_json` | JSON[] | Returned recommendations with received/given/unknown direction. H, BP, D. Never guess direction from an unspecified list. |
| `interests_json` | JSON[] | Returned interest groups and referenced items. H. |
| `causes_json` | JSON[] | Explicitly returned causes, without inferring beliefs from them. H. |
| `services_json` | JSON{} | Profile services, description, media, rating, request URL. H. |
| `featured_json` | JSON{} | Featured cards/slides, links, images, titles and descriptions. H. |
| `websites_json` | JSON[] | Personal/profile links with labels and type when returned. H `websites`, BP `bio_links`. |
| `social_profiles_json` | JSON[] | Other returned social identities, with platform, username and URL if known. O GitHub/Twitter. |
| `emails_json` | JSON[] | Returned contact emails with type and verification metadata. H, D, O. Storage does not authorize another lookup. |
| `phones_json` | JSON[] | Returned phone values and type/source when known. D, O. |
| `profile_highlights_json` | JSON{} | Provider top-card snapshots: current positions/employer, top education, top skills, associated company websites. H, BP, D, O. Retains source claims without silently overriding full history. |
| `related_profiles_json` | JSON[] | Provider's related/also-viewed profiles. H, BP. These are not automatically network members. |
| `posts_preview_json` | JSON[] | Posts included in a profile response. BP. No separate feed crawl implied. |
| `activity_preview_json` | JSON[] | Included activity snippets. BP. Not a complete activity history. |

## Companies columns

Keep a company once, even when many people or multiple roles reference it. A LinkedIn company page may represent a brand or showcase, not a legal entity. Names and domains alone are not universal entity identifiers.

### Identity, description, scale, and location

| Column | Type | Meaning / source |
| --- | --- | --- |
| `linkedin_url` | TEXT | Canonical company-page URL. H, BC, CC, O `li_vanity`. |
| `linkedin_slug` | TEXT | Page universal/public name. H `universalName`, BC `id` after adapter verification. |
| `linkedin_company_id` | TEXT | Stable platform company ID when returned. H `id`, BC `company_id`; text preserves precision. |
| `name` | TEXT | Company/page display name. H, BC, CC, O. |
| `tagline` | TEXT | Page slogan. H `tagline`, BC `slogan`. |
| `description` | TEXT | Full company/about text. H, BC, CC, O. |
| `additional_information` | TEXT | Additional returned company description/context. BC; retain alternate source versions in raw response. |
| `website_url` | TEXT | Full website URL exactly supplied, with a separate normalized version only if useful. H, BC, CC, O. |
| `domain` | TEXT | Provider domain or deterministically extracted hostname; do not automatically merge company records by it. CC, O, BC `website_simplified`. |
| `email_domain` | TEXT | Provider-supplied email domain when different from website domain. O nested company profile. |
| `industries_json` | JSON[] | Industry names, identifiers and classification source when returned. H, BC, CC, O. |
| `specialties_json` | JSON[] | Stated company specialties. H `specialities`, BC/ O `specialties`. |
| `company_type` | TEXT | Public/private/nonprofit/etc. H `companyType`, BC `organization_type`, CC, O `type`. |
| `ownership_status` | TEXT | Separate provider ownership label. CC. Do not conflate it with page type. |
| `founded_on` | TEXT | Partial date, preserving year/month/day precision. H `foundedOn`, CC. |
| `founded_year` | INTEGER | Deterministically derived from `founded_on`, or directly reported year. BC `founded`, O `founded_at`. |
| `company_size_label` | TEXT | Original range or size display. BC `company_size`, CC, O `size` when textual. |
| `employee_count_min` | INTEGER | Lower endpoint of a reported range. H `employeeCountRange.start`. |
| `employee_count_max` | INTEGER | Upper endpoint, null for open-ended ranges. H `employeeCountRange.end`. |
| `linkedin_employee_count` | INTEGER | LinkedIn-associated profiles, explicitly identified as such. BC `employees_in_linkedin`, O `employees`. |
| `reported_employee_count` | INTEGER | Other supplied employee-count values. CC employee count, numeric O `size`, H `employeeCount` until its basis is verified. |
| `reported_employee_count_basis` | TEXT | Reported_total, provider_estimate, or unknown; never assume payroll headcount. Application interpretation with provenance. |
| `followers_count` | INTEGER | Page followers. H, BC, CC, O. |
| `headquarters_label` | TEXT | Original headquarters display string. BC `headquarters`, O `headquarter`. |
| `headquarters_country_code` | TEXT | From an explicitly marked HQ location, not the first country in a multi-country list. H. |
| `headquarters_country` | TEXT | Country name from HQ evidence. H, CC, O. |
| `headquarters_region` | TEXT | State/region from HQ evidence. H, CC. |
| `headquarters_city` | TEXT | City from HQ evidence. H, CC. |
| `headquarters_address` | TEXT | Street/address display from HQ evidence. H, CC. |
| `headquarters_postal_code` | TEXT | Postal code as text. H, CC. |
| `locations_json` | JSON[] | Every returned office/address, raw label, parsed parts and primary/HQ flag. H, BC, O. |
| `country_codes_json` | JSON[] | Countries represented in the page/location result. BC `country_codes_array`/`country_code`; distinct from HQ country. |
| `directions_urls_json` | JSON[] | Returned map/directions links; associate to an office only with evidence. BC. |

### Images, page state, and related entities

| Column | Type | Meaning / source |
| --- | --- | --- |
| `logo_url` | TEXT | Preferred logo image. H, BC, CC, O. |
| `cover_image_url` | TEXT | Preferred background image. H `backgroundCover`, BC `image`. |
| `images_json` | JSON{} | All logo/cover variants and dimensions. H `logos`/`backgroundCovers`. |
| `page_type` | TEXT | Platform page classification. H `pageType`. |
| `is_active` | BOOL | Provider's page-active flag. H `active`; not proof the business is operating. |
| `is_verified` | BOOL | Page verification flag. H `pageVerified`. |
| `is_showcase` | BOOL | Showcase-page flag. H `showcase`. |
| `is_paid_page` | BOOL | Provider's paid-company flag. H `paidCompany`. |
| `is_auto_generated` | BOOL | Auto-generated page flag. H `autoGenerated`. |
| `call_to_action_url` | TEXT | Page CTA target. H `callToActionUrl`. |
| `jobs_url` | TEXT | Link to jobs search, not a job inventory. H `jobSearchUrl`. |
| `affiliated_pages_json` | JSON[] | Related affiliated/showcase page snapshots. H, BC. Do not treat affiliation as legal ownership. |
| `similar_companies_json` | JSON[] | Suggested similar organizations. H, BC. Do not auto-enrich them. |
| `employee_previews_json` | JSON[] | Employee cards included in the page result. BC `employees`. Not the company's whole workforce or the user's network. |
| `alumni_json` | JSON{} | Alumni payload/information when present. BC names these fields but its example is null; preserve native substructure until verified. |
| `posts_preview_json` | JSON[] | Included updates with post IDs, dates, text, media, engagement and repost data. BC `updates`. |

### Additional enrichment when returned

These columns retain profile-associated data the researched providers can supply. They do not mandate buying a different service to fill missing cells.

| Column | Type | Meaning / source |
| --- | --- | --- |
| `technologies_json` | JSON[] | Provider's technology names and evidence if supplied. O. |
| `revenue_json` | JSON{} | Raw revenue text, normalized amount/range/currency/period when supported, and estimate classification. O. Never assume a bare `$` means USD. |
| `funding_json` | JSON{} | Funding totals, status, round count, last round, all returned rounds and their investors. BC, O. |
| `investors_json` | JSON[] | Separately returned investor identities/names. BC. Preserve relation to individual rounds inside funding. |
| `crunchbase_url` | TEXT | Returned Crunchbase profile link. BC. |
| `stock_info_json` | JSON{} | Returned market/ticker/price information without guessing a null sample's schema. BC. |

Funding and revenue scalar filters can be exposed as read-only projections from these objects. Do not keep a second independently editable copy of the same amount or round in several columns.

## Repeating sections

JSON here means a typed list or object with named fields, not a giant unstructured text cell. The viewer should offer readable summaries and expandable entries. Below are proposed normalized nested fields. A field is nullable when a source does not provide it. Preserve source-only extras in the retained raw response.

### Experiences

`experiences_json[]`:

- `experience_key`, `provider_experience_id`, `experience_group_id`, `source_order`.
- `company_key`, `company_linkedin_id`, `company_linkedin_url`, `company_slug`, `company_name`, `company_domain`, `company_website`, `company_logo_url`.
- `title`, `description`, `description_html`, `employment_type`, `workplace_type`, `location_label`.
- `start_date`, `end_date`, `duration_text`, `duration_years` when explicitly supplied.
- `current_status`: current, ended, or unknown; `current_status_evidence`; `is_primary` nullable.
- `skills[]`, `company_snapshot`, `observed_at`, `source_path`.

The provider-native field coverage comes from H, D and O; keys, references, ordering and observation metadata are application fields. The snapshot preserves company information returned with the job, including industry, size and founding information, without confusing it with the company's independently enriched current profile. Top-card company snippets live in `profile_highlights_json` until reconciled with role evidence.

Store every returned role. Only confirmed current roles create new employer enrichment work. Past-company identifiers remain in history; no former-company lookup is needed. Unknown current status must stay unknown. An employer without confident identity retains its name/URL evidence and a null `company_key` until resolved.

### Education, skills, credentials, and accomplishments

| Section | Nested fields to normalize when supplied |
| --- | --- |
| Education | School name, school platform ID/URL/logo, degree, field of study, description, start/end partial dates, period text, associated skills. H, O; other provider extras remain raw. |
| Skills | Name, endorsement count, original endorsement text, associated position labels, source order. H; O may return only strings. |
| Languages | Name, proficiency. H, O, M. |
| Certifications | Name/title, issuer name/URL/logo, credential/license ID, credential URL, issue/expiry partial dates, original issue text. H, O. |
| Projects | Title, description, start/end dates, duration, associated organization/name/link, contributors with names/URLs when supplied. H, O. |
| Volunteering | Role, organization name/ID/URL, cause, start/end dates, duration, description if returned. H, O. |
| Publications | Title, description, URL, publisher, authors, publication date. H, O. |
| Patents | Title, number, issue date, description, URL; further inventor/status fields only when actually supplied. H. |
| Courses | Title and associated organization/name/link. H. |
| Honors and awards | Title, issuer, issue date, description, associated organization/name/link. H. |
| Organizations | Name, position held, description, start/end dates, organization URL and logo. H. |
| Recommendations | Direction when known, text and original object. H only defines opaque objects; D says given/received. Normalize recommender/recipient/date/relationship only after inspecting a populated provider response. |

### Contacts, media, and page details

| Section | Nested fields to normalize when supplied |
| --- | --- |
| Emails | Address, type, provider verification status, deliverable flag, catch-all flag, valid mail-server flag, free-mail flag, quality score, observed/verified time. H, O. Never upgrade “found” into “verified.” |
| Phones | Original value, normalized number only when unambiguous, type, provider status and source when supplied. D/O do not guarantee all these qualifiers. |
| Websites/social profiles | URL or username, platform/type, label, original value. H, BP, O. Do not fabricate URLs for unrecognized handles. |
| Interests | Group name and item title/subtitle/link/caption/image. H. Keep as supplied profile content. |
| Services | Description, service names, media, rating as originally represented, request URL. H. |
| Featured | Top-level title/subtitle/link/images and slides with title/subtitle/description/URL/image. H. |
| Images | Role, URL, width and height where returned. H. URLs may expire; a saved URL does not preserve the image bytes. |
| Locales | Language and country components, including originals when they cannot form a complete locale. H. |
| Profile actions | Type, label, URL and original action object. H. These are data, not instructions to execute actions. |
| Related people | ID, public identifier, URL, name parts/full name, headline/subtitle, location, image and provider relation label, when supplied. H, BP. |

### Company lists and financial objects

| Section | Nested fields to normalize when supplied |
| --- | --- |
| Locations | Original text, address lines 1/2, city, region, country/name/code, postal code, description, HQ/primary flag, parsed variants. H, BC, O. |
| Industries | Name, ID, classification namespace, and original label. H may provide ID/name objects; BC/O can provide a string. |
| Affiliated/similar pages | Platform ID, slug, URL, name, description, industries, follower count, employee range, logo/cover variants, showcase/paid flags when returned. H, BC. |
| Employee previews | Profile URL, display name, subtitle and image. BC. Keep masked names masked. |
| Funding | Total raised and currency, reported round count/status/latest date, last-round date/type/amount/currency/raw amount text, rounds with type/date/raised amount/investors/lead investors/investor count. BC, O. Missing currency or round details stay null. |
| Revenue | Raw value, amount or lower/upper range, currency, period, whether estimated, source. O; only parse what the response or documentation establishes. |
| Posts/activity previews | Provider post ID/URL, date and original relative-time text, title/text/HTML, media, reactions/comments counts, repost object and tagged entities when returned. BC/BP. Retain opaque extras; do not infer complete feed coverage. |
| Alumni/stock | Retain native object/value with source. BC examples are null, so nested output contracts are unverified. |

### Partial dates

Use `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` according to available precision. Preserve original text in the section when parsing fails. Never turn “2020” into “2020-01-01,” or a missing end date into a confirmed current job without provider semantics. ContactOut's example supplies explicit year/month components alongside compact date strings; prefer those components after validation. HarvestAPI supplies year/month/text objects. [ContactOut person response](https://api.contactout.com/#from-linkedin-url), [HarvestAPI types](https://github.com/HarvestAPI/harvestapi-docs/blob/main/linkedin-api-reference/openapi.json).

## Normalization rules

These are design recommendations derived from the inspected differences, not descriptions of already implemented behavior.

1. Keep one source of truth for each fact. Scalar shortcuts such as founded year and primary employer are derived or updated atomically with their underlying structures. Company-to-people links are derived from person experiences; do not store a second mutable employee list.
2. Treat a missing key, null value, empty list, and truncated section differently. `[]` means a source positively returned an empty section only when its contract establishes that; otherwise record unknown completeness. A failed or partial refresh must not erase a previous complete section.
3. Preserve booleans as true/false/unknown. An omitted flag is not false. A provider's “active” page flag does not establish that a company is trading.
4. Names, profile headlines, job titles, company names, and domains are evidence, not universally unique identifiers. Preserve platform IDs as strings. Do not merge opaque profile IDs with numeric member IDs. Keep a stable internal key when a profile slug changes.
5. Separate the company's advertised size band, a provider's numeric employee estimate, and LinkedIn-associated employee count. They can disagree without either being a parsing error. ContactOut explicitly defines `employees` as the LinkedIn count; its `size` is separate.
6. Keep all confirmed current roles, including several roles at one employer. Deduplicate company enrichment by confirmed company identity. A failed company lookup leaves the role and company placeholder available.
7. Prefer a full profile endpoint, then preserve every returned field. Do not launch a waterfall solely to fill every null column. Extra provider capabilities and spending remain explicit workflow configuration.
8. A successful response can still be incomplete. Record provider mode, truncation, and section coverage. “Enriched” describes the lookup outcome, not proof the table contains every fact LinkedIn knows.
9. Keep source provenance and response evidence available to the owner. Default viewing and exports use normalized fields. Raw responses require deliberate inclusion and should never accidentally broaden a shared viewer's data scope.
10. Additional provider fields are preserved by `raw_responses_json` immediately. Add a canonical column only after its type and meaning are understood. Store provider classifications separately from reported profile facts.

## Workflow and viewer consequences

### Execution

The simple workflow is `read/import network → enrich people → collect their confirmed current companies → enrich unique companies → show both tables`. Shared data reuse belongs in the runtime; the network recipe selects the input population and profile coverage.

Use the chosen provider's full-profile mode. Persist imported identities before lookups. Prefer returning substantive profile fields from a company endpoint rather than buying separate calls for every scalar. Reuse fresh company records across people and workflow runs. Keep identity matching conservative and pending work resumable. Serialize this enrichment workflow initially if that satisfies real throughput needs; distributed claims and a general identity graph are not prerequisites for the two-table design.

The current recipe requires workflow-prefixed entities and a separate employment result contract. It needs to change to the shared `people`/`companies` contract. Other workflows must reference shared records rather than create new copies. A workflow's own result/run metadata can still record which records it touched.

### Browsing

People defaults: name, profile, headline, location, current roles/companies, followers, last enriched, status.

Companies defaults: name, domain, description, industry, size range, LinkedIn employee count, headquarters, related people, last enriched, status.

All remaining canonical fields are available through a column chooser and record details. Repeating sections open as readable lists. Exported JSON preserves them; CSV places serialized JSON in a single cell or uses an explicitly selected flattened export. No automatic `job_1` through `job_5` columns, and no row multiplication when a person has several jobs.

The current linked viewer assumes a relationship table. A two-table implementation needs support for company references inside a person's experience list, plus a reverse query. The runtime does this with `jsonb`: `jsonb_array_elements(experiences_json)` for the relation and a GIN index on `experiences_json` for the reverse lookup. Two user-facing tables do not by themselves prove which physical index strategy is best.

### Scope

This is comprehensive profile storage. It does not add a job-feed collector, complete employee directory, post-history collector, automatic outreach, or continuous monitoring. Previews and extra enrichment fields returned by the chosen profile lookup are kept. Starting separate paid lookups is a separate execution decision.

## Coverage audit

The companion [field inventory](linkedin-profile-field-inventory.json) enumerates the proposed columns and maps every top-level field in the inspected HarvestAPI Profile/Company definitions and Bright Data person/company examples. It also records explicit mappings for the documented Monid Clay person fields, ContactOut person/company fields, and Dev Fusion examples.

The HarvestAPI specification contains a reference to `CompanyWebsite` without a matching schema definition. Recommendations are typed as opaque objects. Bright Data's examples include null sections such as stock/alumni data. Those sections are retained, but their subfields are not falsely declared verified.

The proposed dictionary has 67 People profile columns and 55 Companies profile columns, plus 13 shared metadata columns on each table. Structured lists count as one column each. The automated coverage check accounts for all 158 root fields in the four machine-inspected HarvestAPI/Bright Data definitions/examples, with additional documented mappings for Clay, Dev Fusion and ContactOut. This is a storage dictionary; the default table view should show about ten useful columns, with all others selectable.

Coverage means every field in those inspected definitions/examples has a storage destination. It does not mean we executed every endpoint, measured provider completeness, or discovered every field any provider could ever add. The complete original response protects against that open-ended boundary.
