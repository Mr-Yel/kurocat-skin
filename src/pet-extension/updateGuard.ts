/**
 * The custom build must never install an official KuroCat release: that would
 * replace this binary and remove the external character adapter.
 */
export const OFFICIAL_UPDATES_DISABLED = true;

export const UPDATE_DISABLED_MESSAGE =
  '此自定义构建不提供官方在线更新，请手动替换为重新打包的版本。';

export const UPDATE_DISABLED_SHORT = '自定义构建 · 在线更新已禁用';
