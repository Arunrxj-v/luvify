import type { ProjectDetailDto, GenerateSpecificationResponseDto } from "@luvify/shared";

const base = process.env.API_BASE_URL ?? "http://localhost:4000";

const scenarios = [
  {
    name: "Hospital Booking",
    desc: "A hospital appointment booking platform connecting patients with doctors and clinics.",
    type: "business" as const,
    expectedArchetype: "healthcare",
  },
  {
    name: "Local Bakery",
    desc: "Neighbourhood bakery making artisan sourdough bread and custom celebration cakes.",
    type: "restaurant" as const,
    expectedArchetype: "restaurant",
  },
  {
    name: "Docu Photographer",
    desc: "Editorial and documentary wedding photographer accepting commissions.",
    type: "portfolio" as const,
    expectedArchetype: "portfolio",
  },
  {
    name: "Payroll SaaS",
    desc: "Cloud attendance and payroll automation software for UK businesses.",
    type: "saas" as const,
    expectedArchetype: "saas",
  },
  {
    name: "Cleaning Service",
    desc: "Domestic cleaning, end of tenancy and commercial office cleaning services.",
    type: "business" as const,
    expectedArchetype: "business",
  },
];

async function run() {
  console.log(`Running archetype & grounding verification against ${base}...\n`);
  let passed = 0;

  for (const s of scenarios) {
    const res = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: s.name,
        businessName: s.name,
        businessDescription: s.desc,
        websiteType: s.type,
      }),
    });

    if (!res.ok) {
      console.error(`Failed to create project ${s.name}: ${res.status}`);
      continue;
    }

    const proj = (await res.json()) as ProjectDetailDto;
    const archetype = proj.requirements?.website?.archetype;
    const plan = proj.requirements?.website?.pagePlan || [];
    const summary = proj.requirements?.business?.productSummary;

    const archetypeMatches = archetype === s.expectedArchetype;
    console.log(`[${archetypeMatches ? "PASS" : "FAIL"}] ${s.name}:`);
    console.log(`  Archetype: ${archetype} (expected: ${s.expectedArchetype})`);
    console.log(`  Summary:   "${summary}"`);
    console.log(`  Pages:     ${plan.map((p) => p.path).join(", ")}`);

    if (archetypeMatches) passed++;

    // Generate specification to verify alignment
    const specRes = await fetch(`${base}/api/projects/${proj.id}/specification/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (specRes.ok) {
      const spec = (await specRes.json()) as GenerateSpecificationResponseDto;
      console.log(`  Spec:      ${spec.specification.pages.map((p) => p.path).join(", ")}`);
    }

    // Clean up
    await fetch(`${base}/api/projects/${proj.id}`, { method: "DELETE" });
    console.log();
  }

  console.log(`Result: ${passed}/${scenarios.length} scenarios passed.`);
  if (passed !== scenarios.length) {
    process.exitCode = 1;
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
