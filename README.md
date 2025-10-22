> Este repositório foi criado automaticamente pelo Manus para o desenvolvimento do aplicativo Parish.

# Parish App

Aplicativo mobile do sistema Parish, focado no engajamento dos fiéis, consulta de informações e participação nas atividades da comunidade.

## 1. Visão Geral

Este repositório contém o código-fonte do aplicativo móvel do sistema Parish, desenvolvido para iOS e Android. O app é a principal interface para os fiéis interagirem com a vida da paróquia, acessando conteúdos espirituais, eventos, escalas de serviço e muito mais.

## 2. Tecnologias

- **Framework**: [Expo](https://expo.dev/) (React Native)
- **Linguagem**: TypeScript
- **Navegação**: [Expo Router](https://docs.expo.dev/router/introduction/) (v3.x)
- **Gerenciamento de Estado**: Zustand (ou Redux Toolkit)
- **Requisições API**: TanStack Query (React Query)
- **Formulários**: React Hook Form + Zod
- **Banco de Dados Local**: SQLite (via Expo SQLite)

## 3. Funcionalidades Principais (MVP)

- **Home**: Liturgia Diária, Santo do Dia, próximos eventos e horários de missa.
- **Autenticação**: Login, cadastro e recuperação de senha.
- **Calendário**: Visualização de eventos e atividades da paróquia/comunidade.
- **Escalas**: Consulta de escalas de serviço pessoal, check-in e solicitação de trocas.
- **Pedidos de Oração**: Envio e visualização de pedidos de oração da comunidade.
- **Intenções de Missa**: Solicitação de intenções com opção de pagamento online.
- **Avisos**: Feed de notícias e avisos paroquiais.
- **Notificações Push**: Lembretes de eventos, escalas e avisos importantes.
- **Modo Offline**: Acesso a conteúdos essenciais (como a liturgia) sem conexão com a internet.

## 4. Estrutura do Projeto

A estrutura de navegação é baseada em arquivos, utilizando o Expo Router.

```
app/
├── (auth)/             # Telas de autenticação (login, registro)
├── (app)/              # Telas principais da aplicação (após login)
│   ├── (tabs)/         # Navegação principal em abas
│   │   ├── index.tsx   # Home
│   │   ├── calendar.tsx# Calendário
│   │   ├── pray.tsx    # Pedidos de Oração
│   │   ├── news.tsx    # Avisos
│   │   └── profile.tsx # Perfil
│   └── ...             # Outras telas (detalhes de eventos, etc.)
├── _layout.tsx         # Layout principal da aplicação
└── +not-found.tsx      # Tela de 404
```

## 5. Como Começar

### Pré-requisitos

- Node.js (v20.x ou 22.x)
- Git
- Expo CLI: `npm install -g expo-cli`
- App Expo Go no seu celular (iOS ou Android)

### Instalação

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/rodrigospisila/parish-mobile.git
   cd parish-mobile
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente:**
   - Crie um arquivo `.env` na raiz do projeto.
   - Adicione a variável `API_URL` com o endereço do seu backend (ex: `API_URL=http://localhost:3000/api/v1`).

4. **Inicie a aplicação:**
   ```bash
   npm start
   ```

5. **Abra no seu dispositivo:**
   - Escaneie o QR code exibido no terminal com o app Expo Go.

## 6. Testes

- **Testes Unitários**: `npm run test`

## 7. Contribuição

Consulte o arquivo `CONTRIBUTING.md` para mais detalhes sobre como contribuir com o projeto.

