import { useState } from 'react'
import { 
  Table, 
  TextInput, 
  Badge, 
  Pagination, 
  Group, 
  Stack, 
  Text,
  Loader,
  Center
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../api/client'

interface Teaser {
  id: string
  name: string
  status: string
  tags: string[]
  createdAt: string
}

export default function TeaserList() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const itemsPerPage = 5

  const { data: teasers = [], isLoading, isError } = useQuery<Teaser[]>({
    queryKey: ['teasers'],
    queryFn: async () => {
      const response = await apiClient.get('/teasers')
      return response.data
    },
    refetchInterval: 5000,
  })

  const filteredTeasers = teasers.filter(
    (t) => 
      t.name.toLowerCase().includes(search.toLowerCase()) || 
      t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
  )

  const totalPages = Math.ceil(filteredTeasers.length / itemsPerPage)
  const paginatedTeasers = filteredTeasers.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  )

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader size="lg" />
      </Center>
    )
  }

  if (isError) {
    return (
      <Center py="xl">
        <Text c="red">Error loading teasers. Please try again later.</Text>
      </Center>
    )
  }

  return (
    <Stack>
      <TextInput
        placeholder="Search by name or tag..."
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(event) => {
          setSearch(event.currentTarget.value)
          setPage(1)
        }}
      />

      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Tags</Table.Th>
            <Table.Th>Date</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {paginatedTeasers.length > 0 ? (
            paginatedTeasers.map((teaser) => (
              <Table.Tr key={teaser.id}>
                <Table.Td>{teaser.name}</Table.Td>
                <Table.Td>
                  <Badge color={teaser.status === 'processed' ? 'green' : (teaser.status === 'error' ? 'red' : 'blue')}>
                    {teaser.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={5}>
                    {teaser.tags.map((tag) => (
                      <Badge key={tag} variant="outline" size="sm">
                        {tag}
                      </Badge>
                    ))}
                  </Group>
                </Table.Td>
                <Table.Td>{new Date(teaser.createdAt).toLocaleDateString()}</Table.Td>
              </Table.Tr>
            ))
          ) : (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text ta="center" c="dimmed">No teasers found</Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      {totalPages > 1 && (
        <Group justify="center" mt="md">
          <Pagination total={totalPages} value={page} onChange={setPage} />
        </Group>
      )}
    </Stack>
  )
}
