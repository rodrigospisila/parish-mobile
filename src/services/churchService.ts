import api from '../config/api';

export interface Community {
  id: number;
  name: string;
  parishId: number;
}

export interface Parish {
  id: number;
  name: string;
  dioceseId: number;
  communities: Community[];
}

export interface Diocese {
  id: number;
  name: string;
  parishes: Parish[];
}

export const churchService = {
  async getDioceses(): Promise<Diocese[]> {
    try {
      // Mock de dados para desenvolvimento
      const mockData: Diocese[] = [
        {
          id: 1,
          name: 'Diocese de Santa Rita',
          parishes: [
            {
              id: 101,
              name: 'Paróquia Nossa Senhora da Paz',
              dioceseId: 1,
              communities: [
                { id: 1001, name: 'Comunidade São João', parishId: 101 },
                { id: 1002, name: 'Comunidade Santa Clara', parishId: 101 },
              ],
            },
            {
              id: 102,
              name: 'Paróquia São Francisco de Assis',
              dioceseId: 1,
              communities: [
                { id: 1003, name: 'Comunidade Matriz', parishId: 102 },
              ],
            },
          ],
        },
        {
          id: 2,
          name: 'Diocese de São Paulo',
          parishes: [
            {
              id: 201,
              name: 'Paróquia Santo Antônio',
              dioceseId: 2,
              communities: [
                { id: 2001, name: 'Comunidade Central', parishId: 201 },
              ],
            },
          ],
        },
      ];

      // Em um cenário real, faríamos a chamada:
      // const response = await api.get('/church/hierarchy');
      // return response.data;

      return new Promise((resolve) => {
        setTimeout(() => resolve(mockData), 500); // Simula delay de rede
      });
    } catch (error) {
      console.error('Erro ao buscar hierarquia da igreja:', error);
      return [];
    }
  },
};
