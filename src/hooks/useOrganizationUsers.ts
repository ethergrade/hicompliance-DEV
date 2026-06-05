import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import type { UserResource } from '@/types/api';

export type OrganizationUser = UserResource;

export const useOrganizationUsers = (groupId?: string | null) => {
  const { data: users = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['users', groupId],
    queryFn: () => usersApi.list(groupId),
    enabled: !!groupId,
  });
  return { users, loading, refetch };
};
