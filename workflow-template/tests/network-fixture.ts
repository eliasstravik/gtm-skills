// A synthetic network for the benchmark and the read-budget test: N people, five per company, enriched through a
// stubbed Blitz that answers from the Blitz fixtures. Person i works at company i mod C now and left company (i + 7)
// mod C, so ended roles also resolve companies.
import { blitzPerson, blitzCompany } from "./blitz-fixtures";

export const PER_COMPANY = 5;

export function networkFixture(peopleCount: number) {
  const companies = Math.ceil(peopleCount / PER_COMPANY);
  const companyOf = (n: number) => ({
    name: `Company ${n}`,
    domain: `company-${n}.example`,
    linkedin_id: String(1_000_000 + n),
    linkedin_url: `https://www.linkedin.com/company/company-${n}`,
  });
  function person(url: string) {
    const i = Number(url.split("/p").pop());
    const now = companyOf(i % companies), before = companyOf((i + 7) % companies);
    const role = (c: ReturnType<typeof companyOf>, current: boolean, title: string) => ({
      ...blitzPerson.person.experiences[0],
      job_title: title,
      company_name: c.name,
      company_domain: c.domain,
      company_linkedin_id: c.linkedin_id,
      company_linkedin_url: c.linkedin_url,
      job_start_date: current ? "2023-01-01" : "2019-01-01",
      job_end_date: current ? null : "2022-12-01",
      job_is_current: current,
    });
    return {
      ...blitzPerson,
      person: {
        ...blitzPerson.person,
        full_name: `Person ${i}`,
        first_name: "Person",
        last_name: String(i),
        linkedin_url: url,
        linkedin_id: `ACoAA${i}`,
        experiences: [role(now, true, "Head of Growth"), role(before, false, "Growth Lead")],
      },
    };
  }
  function company(url: string) {
    const n = Number(url.split("company-").pop());
    const c = companyOf(n);
    return { ...blitzCompany, company: { ...blitzCompany.company, name: c.name, domain: c.domain, linkedin_id: Number(c.linkedin_id), linkedin_url: c.linkedin_url } };
  }
  /** Replaces fetch with the stub; returns the restore function. */
  function stubBlitz() {
    const original = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const path = new URL(String(url)).pathname;
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      if (path === "/v2/enrichment/person") return Response.json(person(body.person_linkedin_url));
      if (path === "/v2/enrichment/company") return Response.json(company(body.company_linkedin_url));
      throw new Error(`unexpected path ${path}`);
    };
    return () => { globalThis.fetch = original; };
  }
  const rows = Array.from({ length: peopleCount }, (_, i) => ({ profile_url: `https://www.linkedin.com/in/p${i}` }));
  return { people: peopleCount, companies, rows, stubBlitz };
}
