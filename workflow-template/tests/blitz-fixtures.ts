// Fictional people and companies in the exact shape Blitz returns (keys copied from real responses).
export const blitzPerson = {
  found: true,
  person: {
    first_name: "Mira",
    last_name: "Holt",
    full_name: "Mira Holt",
    nickname: null,
    civility_title: null,
    headline: "Head of Growth at Northwind",
    about_me: "Growth and partnerships.",
    linkedin_url: "https://www.linkedin.com/in/mira-holt-1a2b3c",
    linkedin_id: "ACoAAA1234",
    profile_picture_url: "https://media.example/mira.jpg",
    connections_count: 812,
    location: { city: "Oslo", continent: "Europe", state_code: null, postal_code: null, country_code: "NO", street_address: null },
    experiences: [
      {
        job_title: "Head of Growth",
        company_name: "Northwind",
        company_domain: "northwind.example",
        company_linkedin_id: "74068990",
        company_linkedin_url: "https://www.linkedin.com/company/northwind-example",
        job_start_date: "2023-01-01",
        job_end_date: null,
        job_is_current: true,
        job_description: null,
        job_contract_type: "Full-time",
        job_work_arrangement: "On-site",
        job_location: { city: "Oslo", state_code: null, country_code: "NO" },
      },
      {
        job_title: "Growth Lead",
        company_name: "Fjord Labs",
        company_domain: "fjordlabs.example",
        company_linkedin_id: "55512345",
        company_linkedin_url: "https://www.linkedin.com/company/fjord-labs-example",
        job_start_date: "2020-03-01",
        job_end_date: "2022-12-01",
        job_is_current: false,
        job_description: "Built the outbound motion.",
        job_contract_type: "Full-time",
        job_work_arrangement: "Remote",
        job_location: { city: "Bergen", state_code: null, country_code: "NO" },
      },
    ],
    education: [{ degree: "MSc Marketing", school_name: "NHH", start_date: "2014-01-01", end_date: "2016-01-01" }],
    skills: ["Growth", "Partnerships"],
    certifications: [],
  },
  fair_usage: { rate_limit: { requests_per_second: 50, remaining_this_second: 49 }, request_id: "01a0aff7", records_used: 1, next_reset_at: "2026-10-17T13:17:35.079Z", records_remaining: 14997660 },
};

export const blitzCompany = {
  found: true,
  company: {
    name: "Northwind",
    about: "Northwind makes sample data.",
    domain: "northwind.example",
    website: "https://www.northwind.example",
    industry: "Software Development",
    type: "Privately Held",
    size: "11-50",
    followers: 2974,
    employees_on_linkedin: 21,
    founded_year: 2021,
    linkedin_id: 74068990,
    linkedin_url: "https://www.linkedin.com/company/northwind-example",
    specialties: ["data", "samples"],
    hq: { city: "Oslo", state: "Oslo", region: "EMEA", continent: "Europe", country_code: "NO", country_name: "Norway" },
  },
  fair_usage: { rate_limit: { requests_per_second: 50, remaining_this_second: 48 }, request_id: "01a0aff8", records_used: 1, next_reset_at: "2026-10-17T13:17:35.079Z", records_remaining: 14997659 },
};

export const blitzNotFound = {
  found: false,
  person: null,
  fair_usage: { rate_limit: { requests_per_second: 50, remaining_this_second: 47 }, request_id: "01a0aff9", records_used: 0, next_reset_at: "2026-10-17T13:17:35.079Z", records_remaining: 14997659 },
};

export function blitzRun(body: unknown, httpStatus = 200, endpoint = "/v2/enrichment/person") {
  return {
    status: httpStatus >= 200 && httpStatus < 300 ? "COMPLETED" : "FAILED",
    endpoint,
    output: body,
    providerResponse: { httpStatus },
    cost: { value: 0, currency: "USD", unit: "USD" },
  };
}
