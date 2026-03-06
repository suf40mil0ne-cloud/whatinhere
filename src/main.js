import "./style.css";
import { initMapApp } from "./map";
import { SAMPLE_PROJECTS } from "./data";

const mapContainer = document.getElementById("map");
const detailContainer = document.getElementById("project-detail");
const errorContainer = document.getElementById("global-error");

initMapApp({
  mapContainer,
  detailContainer,
  errorContainer,
  projects: SAMPLE_PROJECTS,
});
