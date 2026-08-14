import Docker from 'dockerode';

const docker = new Docker({
    socketPath: '/Users/goludhakad/.docker/run/docker.sock'
});

export default docker;