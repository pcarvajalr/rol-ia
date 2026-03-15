import { CloudTasksClient } from "@google-cloud/tasks"

let client: CloudTasksClient | null = null

function getClient(): CloudTasksClient {
  if (!client) {
    client = new CloudTasksClient()
  }
  return client
}

const PROJECT_ID = process.env.GCP_PROJECT_ID || ""
const LOCATION = process.env.GCP_LOCATION || "us-central1"
const QUEUE_NAME = process.env.GCP_QUEUE_NAME || "rol-ia-leads"
const API_BASE_URL = process.env.API_BASE_URL || ""

function getQueuePath(): string {
  return getClient().queuePath(PROJECT_ID, LOCATION, QUEUE_NAME)
}

function getTaskPath(taskId: string): string {
  return `${getQueuePath()}/tasks/${taskId}`
}

export async function createTask(
  taskId: string,
  endpoint: string,
  delaySec: number,
  payload?: object
): Promise<string> {
  const scheduleTime = new Date(Date.now() + delaySec * 1000)

  const [response] = await getClient().createTask({
    parent: getQueuePath(),
    task: {
      name: getTaskPath(taskId),
      httpRequest: {
        httpMethod: "POST",
        url: `${API_BASE_URL}${endpoint}`,
        headers: { "Content-Type": "application/json" },
        body: payload
          ? Buffer.from(JSON.stringify(payload)).toString("base64")
          : undefined,
      },
      scheduleTime: {
        seconds: Math.floor(scheduleTime.getTime() / 1000),
      },
    },
  })

  console.log(`[task-scheduler] Task created: ${response.name}`)
  return response.name!
}

export async function cancelTask(taskName: string): Promise<void> {
  try {
    await getClient().deleteTask({ name: taskName })
    console.log(`[task-scheduler] Task cancelled: ${taskName}`)
  } catch (error: unknown) {
    const err = error as { code?: number }
    if (err.code === 5) {
      console.log(`[task-scheduler] Task not found (already executed?): ${taskName}`)
    } else {
      throw error
    }
  }
}
