export function inspectionEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name)));
}
