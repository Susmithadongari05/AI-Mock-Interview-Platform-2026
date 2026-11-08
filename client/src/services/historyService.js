import API from './api.js';

const getInterviewHistory = async () => {
  const response = await API.get('/history');
  return response.data.data;
};

const deleteInterview = async interviewId => {
  const response = await API.delete(`/history/${interviewId}`);
  return response.data;
};

const clearInterviewHistory = async () => {
  const response = await API.delete('/history');
  return response.data;
};

export { getInterviewHistory, deleteInterview, clearInterviewHistory };
