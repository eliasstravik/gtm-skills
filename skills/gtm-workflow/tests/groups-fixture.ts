// Stands in for the build's groups.json (`#viewer-groups`): one group holding the fixture network workflow; the result
// only workflow stays in no group. Tests may change it in place.
export const fixtureGroups = [
  { id: "network-group", name: "Network", description: "People in the network and their scores.", workflows: ["stable"] },
];
export default fixtureGroups;
