import { useState } from 'react'
import { Group, Text, rem, Button, Stack } from '@mantine/core'
import { IconUpload, IconVideo, IconX, IconCheck } from '@tabler/icons-react'
import { Dropzone, type FileWithPath, MIME_TYPES } from '@mantine/dropzone'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import apiClient from '../api/client'

export default function UploadSection() {
  const [files, setFiles] = useState<FileWithPath[]>([])
  const queryClient = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('teaser', file)
      const response = await apiClient.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    },
    onSuccess: () => {
      notifications.show({
        title: 'Success',
        message: 'File uploaded successfully! Processing started.',
        color: 'green',
        icon: <IconCheck size={18} />,
      })
      setFiles([])
      queryClient.invalidateQueries({ queryKey: ['teasers'] })
    },
    onError: (error: any) => {
      console.error('Upload error:', error)
      notifications.show({
        title: 'Upload Failed',
        message: error.response?.data?.error || 'There was an error uploading your file.',
        color: 'red',
        icon: <IconX size={18} />,
      })
    },
  })

  const handleUpload = () => {
    if (files.length > 0) {
      uploadMutation.mutate(files[0])
    }
  }

  return (
    <Stack>
      <Dropzone
        onDrop={(files) => setFiles(files)}
        onReject={() => {
          notifications.show({
            title: 'File Rejected',
            message: 'Please upload a valid video file (MP4/MOV) under 50MB.',
            color: 'red',
          })
        }}
        maxSize={50 * 1024 ** 2}
        accept={[MIME_TYPES.mp4, 'video/quicktime']}
        loading={uploadMutation.isPending}
        multiple={false}
      >
        <Group justify="center" gap="xl" mih={220} style={{ pointerEvents: 'none' }}>
          <Dropzone.Accept>
            <IconUpload
              style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-blue-6)' }}
              stroke={1.5}
            />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconX
              style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-red-6)' }}
              stroke={1.5}
            />
          </Dropzone.Reject>
          <Dropzone.Idle>
            <IconVideo
              style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-dimmed)' }}
              stroke={1.5}
            />
          </Dropzone.Idle>

          <div>
            <Text size="xl" inline>
              Drag teaser here or click to select file
            </Text>
            <Text size="sm" c="dimmed" inline mt={7}>
              Attach a video file (MP4/MOV), each file should not exceed 50MB
            </Text>
          </div>
        </Group>
      </Dropzone>

      {files.length > 0 && (
        <Group justify="center">
          <Text size="sm">Selected: {files[0].name}</Text>
          <Button onClick={handleUpload} loading={uploadMutation.isPending}>
            Upload and Process
          </Button>
        </Group>
      )}
    </Stack>
  )
}
