# 📱 Parish Mobile - Expo Router (2025)

Aplicativo mobile do sistema Parish desenvolvido com **Expo Router** e **React Native**, seguindo as **melhores práticas de 2025**.

## 🚀 Tecnologias

- **Expo SDK 54** - Framework React Native
- **Expo Router** - Navegação baseada em arquivos (file-based routing)
- **TypeScript** - Tipagem estática
- **Axios** - Cliente HTTP
- **AsyncStorage** - Armazenamento local

## 📁 Estrutura (Melhores Práticas 2025)

```
app/                    # Rotas (Expo Router)
├── (auth)/            # Grupo de autenticação
│   ├── login.tsx
│   └── register.tsx
├── (tabs)/            # Grupo de tabs
│   ├── index.tsx     # Home
│   ├── liturgy.tsx
│   ├── events.tsx
│   └── profile.tsx
└── _layout.tsx        # Layout raiz

src/
├── contexts/          # Contextos React
├── hooks/             # Custom hooks
├── services/          # Serviços de API
├── types/             # Tipos TypeScript
└── utils/             # Utilitários
```

## 📦 Instalação

```bash
npm install
npm start
```

## ⚙️ Configuração

Edite `src/constants/api.ts` com o IP da sua máquina:

```typescript
export const API_BASE_URL = 'http://SEU_IP:3000/api/v1';
```

## 🆕 Novidades 2025

✅ **Expo Router** - File-based routing  
✅ **Grupos de rotas** - `(auth)` e `(tabs)`  
✅ **Estrutura `/src`** - Separação clara  
✅ **Services Layer** - Camada de serviços  
✅ **Custom Hooks** - Hooks reutilizáveis  
✅ **Path Aliases** - Imports limpos com `@/`

## 🔗 Repositórios

- Backend: [parish-backend](https://github.com/rodrigospisila/parish-backend)
- Web: [parish-web](https://github.com/rodrigospisila/parish-web)

