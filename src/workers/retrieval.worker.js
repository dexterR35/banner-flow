import { exactSearch } from '../core/generation/search.js';
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      hits: exactSearch(data.records, data.query, data.profileId, data.eligibleIds, data.topK),
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
