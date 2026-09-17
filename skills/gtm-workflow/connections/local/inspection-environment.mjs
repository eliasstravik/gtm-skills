export function inspectionEnvironment(environment, managedNames = []) {
  const names = new Set(managedNames);
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !names.has(name) && !/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name)));
}
