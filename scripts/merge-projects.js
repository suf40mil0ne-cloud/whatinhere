import path from "node:path";
import { mergeCapitalProjects } from "../lib/capital-normalizers.js";
import {
  dedupeProjects,
  ensurePipelineDirs,
  readJsonFile,
  readNormalizedSource,
  summarizeByCategory,
  summarizeByOrigin,
  summarizeByRegion,
  writeJsonFile,
} from "./project-normalizers.js";

ensurePipelineDirs();

const seedProjects = readJsonFile(path.resolve("public/data/projects.json"), []);
const sourceKeys = [
  "kiscon",
  "railway",
  "housing",
  "urban-plan",
  "road",
  "building-plot",
  "building-hub",
  "building-overview",
  "building-permits",
  "housing-approvals",
  "committee-results",
  "private-urban-plan",
  "eia",
  "capital-construction",
  "cals-construction",
];
const sourceItems = sourceKeys.flatMap((sourceKey) => readNormalizedSource(sourceKey));
const mergedProjects = mergeCapitalProjects(dedupeProjects([...seedProjects, ...sourceItems]));

writeJsonFile(path.resolve("public/data/projects.generated.json"), mergedProjects);

console.log("[merge-projects] seed projects:", seedProjects.length);
sourceKeys.forEach((sourceKey) => {
  console.log(`[merge-projects] ${sourceKey}:`, readNormalizedSource(sourceKey).length);
});
console.log("[merge-projects] total:", mergedProjects.length);
console.log("[merge-projects] by category:", summarizeByCategory(mergedProjects));
console.log("[merge-projects] by origin:", summarizeByOrigin(mergedProjects));
console.log("[merge-projects] by region:", summarizeByRegion(mergedProjects));
