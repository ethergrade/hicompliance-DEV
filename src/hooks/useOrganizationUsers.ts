import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import type { UserResource } from '@/types/api';

export type OrganizationUser = UserResource;

export const useOrganizationUsers = () => {
  const { data: users = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['organization-users'],
    queryFn: () => usersApi.list(),
  });

  return { users, loading, refetch };
};
};
