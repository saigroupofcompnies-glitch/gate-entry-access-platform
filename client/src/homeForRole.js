export function homeForRole(role) {
  switch (role) {
    case "CANDIDATE":
      return "/candidate";
    case "SUPER_ADMIN":
      return "/admin";
    case "CLIENT":
    case "DEPARTMENT_OFFICER":
      return "/control-room";
    case "CENTRE_HEAD":
      return "/centre";
    case "STAFF":
      return "/staff";
    case "BIOMETRIC_OPERATOR":
      return "/classroom";
    case "SECURITY_OPERATOR":
    case "CENTRE_OPERATOR":
      return "/gate";
    default:
      return "/";
  }
}
