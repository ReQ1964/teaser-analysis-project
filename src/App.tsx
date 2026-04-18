import { Container, Title, Stack, Divider } from '@mantine/core'
import UploadSection from './components/UploadSection'
import TeaserList from './components/TeaserList'

function App() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={1}>Teaser Tagger</Title>
          <Title order={4} fw={400} c="dimmed">
            Upload your teaser and let AI tag it for you
          </Title>
        </div>

        <UploadSection />

        <Divider my="md" label="Processed Teasers" labelPosition="center" />

        <TeaserList />
      </Stack>
    </Container>
  )
}

export default App
