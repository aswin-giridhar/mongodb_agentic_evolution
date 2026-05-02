import type { Person } from "@/types";

export type PersonPosition = { x: number; y: number };

export const PERSON_POSITIONS: Record<string, PersonPosition> = {
  "people.marcus": { x: 540, y: 240 },
  "people.elena": { x: 880, y: 240 },
  "people.priya": { x: 220, y: 540 },
  "people.raj": { x: 460, y: 540 },
  "people.sara": { x: 900, y: 540 },
  "people.james": { x: 1140, y: 540 },
};

export const people: Person[] = [
  {
    _id: "people.marcus",
    type: "person",
    name: "Marcus",
    team: "platform",
    expertise: ["redis", "rate-limiting", "caching"],
    expertise_evidence: ["slack:marcus-rate-limit-warning"],
  },
  {
    _id: "people.elena",
    type: "person",
    name: "Elena",
    team: "platform",
    expertise: ["postgres", "transactions"],
    expertise_evidence: ["pr:1192"],
  },
  {
    _id: "people.priya",
    type: "person",
    name: "Priya",
    team: "mobile",
    expertise: ["react-native", "checkout-flow"],
    expertise_evidence: ["pr:1247"],
  },
  {
    _id: "people.raj",
    type: "person",
    name: "Raj",
    team: "mobile",
    expertise: ["graphql", "api-clients"],
    expertise_evidence: ["pr:1233"],
  },
  {
    _id: "people.sara",
    type: "person",
    name: "Sara",
    team: "growth",
    expertise: ["analytics", "experimentation"],
    expertise_evidence: ["jira:GROWTH-204"],
  },
  {
    _id: "people.james",
    type: "person",
    name: "James",
    team: "growth",
    expertise: ["dashboards", "reporting"],
    expertise_evidence: ["pr:1188"],
  },
];
