import api, { getAccessToken } from '../config/api';

/**
 * Foto de perfil do usuário. A "versão" global força os componentes UserAvatar
 * a re-buscarem a imagem após trocar/remover a foto (o cache do RN Image é por
 * URL — mudar o ?t= invalida).
 */
let version = Date.now();
const listeners = new Set<(v: number) => void>();

export const getAvatarVersion = () => version;
export const onAvatarVersion = (listener: (v: number) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const bumpAvatarVersion = () => {
  version = Date.now();
  listeners.forEach((listener) => listener(version));
};

export const avatarUrlFor = (userId: string, v: number) =>
  `${api.defaults.baseURL ?? ''}/users/${userId}/avatar?t=${v}`;

export const getAuthHeader = async (): Promise<Record<string, string>> => {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const uploadMyAvatar = async (asset: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}): Promise<void> => {
  const form = new FormData();
  form.append('file', {
    uri: asset.uri,
    type: asset.mimeType ?? 'image/jpeg',
    name: asset.fileName ?? 'avatar.jpg',
  } as any);
  await api.post('/users/me/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  bumpAvatarVersion();
};

export const deleteMyAvatar = async (): Promise<void> => {
  await api.delete('/users/me/avatar');
  bumpAvatarVersion();
};
