// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRequestPath(ctx: any) {
  if (typeof ctx?.path === 'string' && ctx.path.length > 0) {
    return ctx.path;
  }
  const requestUrl = ctx?.request?.url;
  if (typeof requestUrl !== 'string' || requestUrl.length === 0) {
    return '';
  }
  try {
    return new URL(requestUrl).pathname;
  } catch {
    return '';
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSessionUserId(ctx: any) {
  return (
    ctx?.context?.session?.user?.id ||
    ctx?.context?.session?.session?.userId ||
    null
  );
}

async function resolveTwoFactorDisableUserUpdate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findUserById: any
) {
  if (data?.twoFactorEnabled !== false) {
    return null;
  }
  const requestPath = getRequestPath(ctx);
  if (!requestPath.includes('/two-factor/disable')) {
    return null;
  }
  const userId = getSessionUserId(ctx);
  if (!userId) {
    return null;
  }
  const user = await findUserById(userId);
  if (!user?.mfa_email_enabled) {
    return null;
  }
  return { twoFactorEnabled: true };
}
export { resolveTwoFactorDisableUserUpdate };
export default {
  resolveTwoFactorDisableUserUpdate,
};
