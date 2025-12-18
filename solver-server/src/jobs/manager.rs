use dashmap::DashMap;
use serde::Serialize;
use solver_core::{models::ApiInput, run_solver};
use std::sync::{Arc, Mutex};
use tokio::task;
use uuid::Uuid;

#[derive(Serialize, Clone, Debug)]
pub enum JobStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Serialize, Clone, Debug)]
pub struct Job {
    pub id: Uuid,
    pub status: JobStatus,
    // In the future, this could hold the final schedule
    pub result: Option<String>,
}

#[derive(Clone)]
pub struct JobManager {
    jobs: Arc<DashMap<Uuid, Arc<Mutex<Job>>>>,
}

impl JobManager {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(DashMap::new()),
        }
    }

    pub fn create_job(&self, input: ApiInput) -> Uuid {
        let job_id = Uuid::new_v4();
        let job = Arc::new(Mutex::new(Job {
            id: job_id,
            status: JobStatus::Pending,
            result: None,
        }));
        self.jobs.insert(job_id, job.clone());

        task::spawn(async move {
            {
                let mut j = job.lock().unwrap();
                j.status = JobStatus::Running;
            }

            let solver_result = run_solver(&input);

            let mut j = job.lock().unwrap();
            match &solver_result {
                Ok(_) => {
                    j.status = JobStatus::Completed;
                    j.result = serde_json::to_string(&solver_result).ok();
                }
                Err(e) => {
                    j.status = JobStatus::Failed;
                    j.result = Some(format!("{e:?}"));
                }
            };
        });

        job_id
    }

    pub fn get_job(&self, id: Uuid) -> Option<Job> {
        self.jobs.get(&id).map(|job| job.lock().unwrap().clone())
    }
}
